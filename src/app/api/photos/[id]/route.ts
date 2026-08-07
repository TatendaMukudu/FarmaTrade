import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchPhoto } from "@/lib/storage";
import { getCurrentParty } from "@/lib/auth";
import { detectImageFormat } from "@/lib/image-validation";
import { logger } from "@/lib/logger";

// Second line of defence, independent of upload validation. Uploads are now
// sniffed before storage, but rows written before that fix still carry
// whatever Content-Type their uploader claimed — so nothing here trusts the
// stored `mimeType` either. The bytes are re-sniffed on the way out and the
// response is served under the type we derive, never the type we stored.
//
// The headers below assume that check can still somehow be wrong:
//   nosniff          — stops a browser content-sniffing its way to a
//                      different (scriptable) interpretation
//   sandbox CSP      — an active document served from here gets no script
//                      execution, no same-origin, no forms
//   attachment       — a direct navigation downloads rather than renders;
//                      <img> embedding is unaffected, which is the only way
//                      the app itself uses this route
const HARDENED_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Content-Disposition": "attachment",
} as const;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Route handlers aren't covered by proxy.ts's matcher (that only
  // redirects HTML page requests to /login) — without this, anyone with a
  // photo ID got the bytes back, signed in or not.
  const party = await getCurrentParty();
  if (!party) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  const photo = await prisma.photo.findUnique({
    where: { id },
    select: { data: true, mimeType: true, storageKey: true },
  });
  if (!photo) return new NextResponse(null, { status: 404 });

  // storageKey means R2; its absence means one of the photos uploaded
  // before this migration, still sitting in Postgres as bytea — both keep
  // working through the same URL, so nothing downstream (post cards,
  // the conversation page) needs to know which one it's looking at.
  const body = photo.storageKey
    ? (await fetchPhoto(photo.storageKey))?.body
    : photo.data;
  if (!body) return new NextResponse(null, { status: 404 });

  const bytes = new Uint8Array(body);
  // Derived here, from the bytes actually being returned — not read from
  // the row, and not taken from R2's stored metadata, both of which record
  // what an uploader once claimed.
  const format = detectImageFormat(bytes);
  if (!format) {
    logger.warn("photos.blocked_non_image", { photoId: id });
    return new NextResponse(null, { status: 415 });
  }

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": format,
      // Private: these are photos of one party's goods shown to a
      // counterparty, and the route is auth-gated. `public` would let a
      // shared proxy serve them to the next person through it.
      "Cache-Control": "private, max-age=31536000, immutable",
      ...HARDENED_HEADERS,
    },
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchPhoto } from "@/lib/storage";
import { getCurrentParty } from "@/lib/auth";

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
  if (photo.storageKey) {
    const object = await fetchPhoto(photo.storageKey);
    if (!object) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(object.body), {
      headers: {
        "Content-Type": object.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  if (!photo.data) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

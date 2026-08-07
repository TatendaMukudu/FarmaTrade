// Content-type validation from the file's own bytes, not from what the
// uploader claimed.
//
// The check this replaces was `file.type.startsWith("image/")`, against a
// string the browser sends and an attacker controls completely. Passing
// `image/svg+xml` sailed through it, got stored verbatim, and came back out
// of /api/photos/[id] as the response's Content-Type — and an SVG served as
// image/svg+xml from your own origin executes any <script> inside it. That
// is stored XSS with session theft on the end of it, reachable by anyone
// who can post a listing.
//
// So: sniff the magic bytes, ignore the claim, and store the type *we*
// determined. SVG has no magic number, is XML rather than a raster format,
// and is the whole reason this file exists — it is not on the list.
//
// Pure and DB-free so the signature table is directly testable.

export type ImageFormat = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

// Longest prefix any check below needs (WebP reads through byte 11).
export const SNIFF_BYTES = 12;

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, i) => bytes[i] === byte);
}

const JPEG = [0xff, 0xd8, 0xff] as const;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const GIF87 = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] as const;
const GIF89 = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] as const;
// WebP is a RIFF container: "RIFF" <4-byte length> "WEBP". The length in
// between is why this can't be a single prefix compare.
const RIFF = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP = [0x57, 0x45, 0x42, 0x50] as const;

// Returns the format the bytes actually are, or null if they aren't one of
// the four raster formats worth accepting. Null means reject — never fall
// back to the client's claim, which is the bug this exists to close.
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  if (startsWith(bytes, PNG)) return "image/png";
  if (startsWith(bytes, GIF87) || startsWith(bytes, GIF89)) return "image/gif";
  if (
    startsWith(bytes, RIFF) &&
    bytes.length >= 12 &&
    WEBP.every((byte, i) => bytes[8 + i] === byte)
  ) {
    return "image/webp";
  }
  return null;
}

export const ACCEPTED_IMAGE_FORMATS = "JPEG, PNG, WebP or GIF";

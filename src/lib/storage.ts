import "server-only";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

// R2 speaks the S3 API, so the standard AWS SDK works unmodified against
// it — the only difference from real S3 is pointing `endpoint` at R2's
// account-specific URL and setting `region: "auto"` (R2 doesn't have AWS
// regions). That portability is deliberate: this file would work unchanged
// against real S3, Backblaze B2, or MinIO if that's ever the right move.
function client() {
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

function bucket() {
  const name = process.env.R2_BUCKET;
  if (!name) throw new Error("R2_BUCKET environment variable is not set");
  return name;
}

export async function uploadPhoto(key: string, body: Buffer, contentType: string) {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

// Returns raw bytes rather than the stream directly — every current
// caller (the photo-serving route) needs the whole object in memory
// anyway to set Content-Length, and Node's stream-to-buffer dance isn't
// worth exposing at every call site for the sizes these photos are
// capped at (4MB, enforced at upload).
export async function fetchPhoto(key: string): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const result = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) return null;
    return { body: Buffer.from(bytes), contentType: result.ContentType ?? "application/octet-stream" };
  } catch (err) {
    if (err instanceof Error && err.name === "NoSuchKey") return null;
    throw err;
  }
}

export async function deletePhoto(key: string) {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

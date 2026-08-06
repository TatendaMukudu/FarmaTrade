// Integration test against the real R2 bucket — not mocked. This is
// exactly the module that talks to R2, so a mock here would only prove
// the mock works, not that the credentials/endpoint/bucket are wired
// correctly. Every object this test creates is deleted in afterEach.
//
// CI doesn't have R2 credentials configured (putting a real R2 secret key
// into GitHub Actions is a deliberate call for a human to make, not
// something to do by default), so this suite skips itself when they're
// absent rather than failing the build — it still runs for real,
// verifying real behavior, wherever the credentials are actually present.
import { afterEach, describe, expect, it } from "vitest";
import { uploadPhoto, fetchPhoto, deletePhoto } from "./storage";

function testKey() {
  return `vitest/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe.skipIf(!process.env.R2_ACCESS_KEY_ID)("R2 storage", () => {
  const keysToClean: string[] = [];

  afterEach(async () => {
    await Promise.all(keysToClean.splice(0).map((key) => deletePhoto(key)));
  });

  it("round-trips an uploaded object: same bytes, same content type", async () => {
    const key = testKey();
    keysToClean.push(key);
    const body = Buffer.from("FarmaTrade R2 integration test payload");

    await uploadPhoto(key, body, "text/plain");
    const result = await fetchPhoto(key);

    expect(result).not.toBeNull();
    expect(result!.body.toString("utf-8")).toBe(body.toString("utf-8"));
    expect(result!.contentType).toBe("text/plain");
  });

  it("returns null for a key that was never uploaded", async () => {
    const result = await fetchPhoto(`vitest/never-uploaded-${Date.now()}`);
    expect(result).toBeNull();
  });

  it("returns null after the object is deleted", async () => {
    const key = testKey();
    const body = Buffer.from("will be deleted");

    await uploadPhoto(key, body, "text/plain");
    expect(await fetchPhoto(key)).not.toBeNull();

    await deletePhoto(key);
    expect(await fetchPhoto(key)).toBeNull();
  });

  it("preserves binary content exactly (not just text)", async () => {
    const key = testKey();
    keysToClean.push(key);
    const body = Buffer.from([0, 1, 2, 255, 254, 253, 128, 127]);

    await uploadPhoto(key, body, "application/octet-stream");
    const result = await fetchPhoto(key);

    expect(result!.body.equals(body)).toBe(true);
  });
});

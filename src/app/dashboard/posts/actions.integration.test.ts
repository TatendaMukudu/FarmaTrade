// Integration test for discardDraftPost's cleanup: the Photo row must be
// gone (Postgres cascade) and the underlying R2 object must actually be
// deleted (application code, since Postgres cascade can't reach R2) — not
// mocked, since a mock here would only prove the mock works. CI has no R2
// credentials configured, so this suite skips itself when they're absent,
// same as storage.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeCookies, resetNextRuntime } from "@/test/next-runtime-stub";
import { createTestParty, createTestPost, createTestPhoto, cleanupParties } from "@/test/factories";

vi.mock("next/headers", () => ({
  cookies: async () => fakeCookies,
  headers: async () => ({ get: () => null }),
}));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { discardDraftPost } = await import("./actions");
const { createSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { uploadPhoto, fetchPhoto, deletePhoto } = await import("@/lib/storage");

async function loginAs(userId: string) {
  await createSession(userId, 0);
}

function testKey() {
  return `vitest/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe.skipIf(!process.env.R2_ACCESS_KEY_ID)("discardDraftPost", () => {
  const partyIds: string[] = [];
  const keysToClean: string[] = [];

  beforeEach(() => resetNextRuntime());
  afterEach(async () => {
    await cleanupParties(partyIds.splice(0));
    await Promise.all(keysToClean.splice(0).map((key) => deletePhoto(key)));
  });

  it("deletes the Photo row (DB cascade) and the R2 object (application code) along with the post", async () => {
    const { user, party } = await createTestParty();
    partyIds.push(party.id);
    const post = await createTestPost(party.id, { status: "DRAFT" });

    const key = testKey();
    keysToClean.push(key);
    await uploadPhoto(key, Buffer.from("discardDraftPost test photo"), "image/jpeg");
    const photo = await createTestPhoto(post.id, key);

    await loginAs(user.id);
    await discardDraftPost(formData({ id: post.id }));

    expect(await prisma.post.findUnique({ where: { id: post.id } })).toBeNull();
    expect(await prisma.photo.findUnique({ where: { id: photo.id } })).toBeNull();
    expect(await fetchPhoto(key)).toBeNull();
  });

  it("does nothing for a draft post the caller doesn't own", async () => {
    const owner = await createTestParty();
    const other = await createTestParty();
    partyIds.push(owner.party.id, other.party.id);
    const post = await createTestPost(owner.party.id, { status: "DRAFT" });

    await loginAs(other.user.id);
    await discardDraftPost(formData({ id: post.id }));

    expect(await prisma.post.findUnique({ where: { id: post.id } })).not.toBeNull();
  });
});

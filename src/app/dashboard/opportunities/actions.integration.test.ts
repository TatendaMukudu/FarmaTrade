// Integration test for the most consequential business logic in the app:
// confirmMatch is the append-only trust pipeline (TransactionConfirmation +
// Rating -> Match completion -> Reputation + Relation recompute), and
// respondToMatch is the authorization boundary on who can accept/decline a
// match. Both are exercised here as a signed-in party against a real
// Postgres, not just asserted against mocked Prisma calls.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeCookies, resetNextRuntime } from "@/test/next-runtime-stub";
import { createTestParty, createTestPost, createTestMatch, cleanupParties } from "@/test/factories";

vi.mock("next/headers", () => ({
  cookies: async () => fakeCookies,
  headers: async () => ({ get: () => null }),
}));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { respondToMatch, confirmMatch } = await import("./actions");
const { createSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

async function loginAs(userId: string) {
  await createSession(userId);
}

async function setUpMatchedPair(matchStatus: "SUGGESTED" | "ACCEPTED" = "ACCEPTED") {
  const seller = await createTestParty({ province: "Harare", district: "Harare" });
  const buyer = await createTestParty({ province: "Harare", district: "Harare" });
  const have = await createTestPost(seller.party.id, { type: "HAVE", category: "PRODUCE" });
  const need = await createTestPost(buyer.party.id, { type: "NEED", category: "PRODUCE" });
  const match = await createTestMatch(have.id, need.id, matchStatus);
  return { seller, buyer, match };
}

describe("respondToMatch", () => {
  const partyIds: string[] = [];
  beforeEach(() => resetNextRuntime());
  afterEach(async () => {
    await cleanupParties(partyIds.splice(0));
  });

  it("lets a party in the match accept it", async () => {
    const { seller, buyer, match } = await setUpMatchedPair("SUGGESTED");
    partyIds.push(seller.party.id, buyer.party.id);

    await loginAs(seller.user.id);
    await respondToMatch(formData({ id: match.id, decision: "ACCEPTED" }));

    const updated = await prisma.match.findUnique({ where: { id: match.id } });
    expect(updated!.status).toBe("ACCEPTED");
  });

  it("lets a party in the match decline it", async () => {
    const { seller, buyer, match } = await setUpMatchedPair("SUGGESTED");
    partyIds.push(seller.party.id, buyer.party.id);

    await loginAs(buyer.user.id);
    await respondToMatch(formData({ id: match.id, decision: "DECLINED" }));

    const updated = await prisma.match.findUnique({ where: { id: match.id } });
    expect(updated!.status).toBe("DECLINED");
  });

  it("refuses to change a match's status for a party who isn't in it", async () => {
    const { seller, buyer, match } = await setUpMatchedPair("SUGGESTED");
    const outsider = await createTestParty();
    partyIds.push(seller.party.id, buyer.party.id, outsider.party.id);

    await loginAs(outsider.user.id);
    await respondToMatch(formData({ id: match.id, decision: "ACCEPTED" }));

    const updated = await prisma.match.findUnique({ where: { id: match.id } });
    expect(updated!.status).toBe("SUGGESTED");
  });
});

describe("confirmMatch", () => {
  const partyIds: string[] = [];
  beforeEach(() => resetNextRuntime());
  afterEach(async () => {
    await cleanupParties(partyIds.splice(0));
  });

  it("refuses to confirm a match that isn't ACCEPTED", async () => {
    const { seller, buyer, match } = await setUpMatchedPair("SUGGESTED");
    partyIds.push(seller.party.id, buyer.party.id);

    await loginAs(seller.user.id);
    const result = await confirmMatch(
      {},
      formData({ matchId: match.id, outcome: "COMPLETED_GOOD" }),
    );
    expect(result.error).toMatch(/isn't in a confirmable state/i);
  });

  it("refuses a party who isn't part of the match", async () => {
    const { seller, buyer, match } = await setUpMatchedPair("ACCEPTED");
    const outsider = await createTestParty();
    partyIds.push(seller.party.id, buyer.party.id, outsider.party.id);

    await loginAs(outsider.user.id);
    const result = await confirmMatch(
      {},
      formData({ matchId: match.id, outcome: "COMPLETED_GOOD" }),
    );
    expect(result.error).toMatch(/not part of this match/i);
  });

  it("records a first confirmation without completing the match yet", async () => {
    const { seller, buyer, match } = await setUpMatchedPair("ACCEPTED");
    partyIds.push(seller.party.id, buyer.party.id);

    await loginAs(seller.user.id);
    const result = await confirmMatch(
      {},
      formData({ matchId: match.id, outcome: "COMPLETED_GOOD" }),
    );
    expect(result.error).toBeUndefined();

    const updated = await prisma.match.findUnique({ where: { id: match.id } });
    expect(updated!.status).toBe("ACCEPTED");

    const sellerReputation = await prisma.reputation.findUnique({ where: { partyId: seller.party.id } });
    expect(sellerReputation!.completedCount).toBe(1);
  });

  it("completes the match, recomputes reputation for both sides, and forms a Relation once both sides confirm", async () => {
    const { seller, buyer, match } = await setUpMatchedPair("ACCEPTED");
    partyIds.push(seller.party.id, buyer.party.id);

    await loginAs(seller.user.id);
    await confirmMatch({}, formData({ matchId: match.id, outcome: "COMPLETED_GOOD", score: "5" }));

    await loginAs(buyer.user.id);
    const result = await confirmMatch(
      {},
      formData({ matchId: match.id, outcome: "COMPLETED_GOOD", score: "4" }),
    );
    expect(result.error).toBeUndefined();

    const updated = await prisma.match.findUnique({ where: { id: match.id } });
    expect(updated!.status).toBe("COMPLETED");

    const sellerReputation = await prisma.reputation.findUnique({ where: { partyId: seller.party.id } });
    const buyerReputation = await prisma.reputation.findUnique({ where: { partyId: buyer.party.id } });
    expect(sellerReputation!.completedCount).toBe(1);
    expect(buyerReputation!.completedCount).toBe(1);
    // seller rated 4 (by buyer), buyer rated 5 (by seller) — each averageRating
    // reflects what the *other* side said about them.
    expect(sellerReputation!.averageRating).toBe(4);
    expect(buyerReputation!.averageRating).toBe(5);

    const [partyAId, partyBId] = [seller.party.id, buyer.party.id].sort();
    const relation = await prisma.relation.findUnique({
      where: { partyAId_partyBId_kind: { partyAId, partyBId, kind: "PREFERRED_PARTNER" } },
    });
    expect(relation).not.toBeNull();
    expect(relation!.strength).toBe(1);
  });

  it("rejects a second confirmation from the same party on the same match as a duplicate, without double-writing", async () => {
    const { seller, buyer, match } = await setUpMatchedPair("ACCEPTED");
    partyIds.push(seller.party.id, buyer.party.id);

    await loginAs(seller.user.id);
    await confirmMatch({}, formData({ matchId: match.id, outcome: "COMPLETED_GOOD" }));
    const second = await confirmMatch({}, formData({ matchId: match.id, outcome: "COMPLETED_GOOD" }));

    expect(second.error).toMatch(/already logged/i);

    const count = await prisma.transactionConfirmation.count({ where: { matchId: match.id, partyId: seller.party.id } });
    expect(count).toBe(1);
  });
});

// Integration test for the most consequential business logic in the app:
// confirmMatch is the append-only trust pipeline (TransactionConfirmation +
// Rating -> Match completion -> Reputation + Relation recompute), and
// respondToMatch is the authorization boundary on who can accept/decline a
// match. Both are exercised here as a signed-in party against a real
// Postgres, not just asserted against mocked Prisma calls.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeCookies, resetNextRuntime } from "@/test/next-runtime-stub";
import { createTestParty, createTestIntent, createTestMatch, cleanupParties } from "@/test/factories";

vi.mock("next/headers", () => ({
  cookies: async () => fakeCookies,
  headers: async () => ({ get: () => null }),
}));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { respondToMatch, confirmMatch, proposeMatchTerms } = await import("./actions");
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
  const have = await createTestIntent(seller.party.id, { side: "SUPPLY", category: "PRODUCE" });
  const need = await createTestIntent(buyer.party.id, { side: "DEMAND", category: "PRODUCE" });
  const match = await createTestMatch(have.id, need.id, matchStatus);
  return { seller, buyer, match };
}

describe("respondToMatch", () => {
  const partyIds: string[] = [];
  beforeEach(() => resetNextRuntime());
  afterEach(async () => {
    await cleanupParties(partyIds.splice(0));
  });

  it("records one party's acceptance without settling the trade", async () => {
    // This assertion used to read ACCEPTED, which was the bug: one party
    // clicking accept moved the engagement to a state that reserved the
    // counterparty's capacity. Now it records where the seller stands and
    // waits for an answer.
    const { seller, buyer, match } = await setUpMatchedPair("SUGGESTED");
    partyIds.push(seller.party.id, buyer.party.id);

    await loginAs(seller.user.id);
    await respondToMatch(formData({ id: match.id, decision: "ACCEPTED" }));

    const updated = await prisma.match.findUnique({ where: { id: match.id } });
    expect(updated!.status).toBe("NEGOTIATING");

    const terms = await prisma.agreementTerms.findMany({
      where: { matchId: match.id },
      include: { acceptances: true },
    });
    expect(terms).toHaveLength(1);
    expect(terms[0].acceptances.map((a) => a.partyId)).toEqual([seller.party.id]);
  });

  it("settles the trade when the second party agrees to the same terms", async () => {
    const { seller, buyer, match } = await setUpMatchedPair("SUGGESTED");
    partyIds.push(seller.party.id, buyer.party.id);

    await loginAs(seller.user.id);
    await respondToMatch(formData({ id: match.id, decision: "ACCEPTED" }));

    await loginAs(buyer.user.id);
    await respondToMatch(formData({ id: match.id, decision: "ACCEPTED" }));

    const updated = await prisma.match.findUnique({ where: { id: match.id } });
    expect(updated!.status).toBe("AGREED");
  });

  it("records who cancelled after both parties agreed", async () => {
    const { seller, buyer, match } = await setUpMatchedPair("SUGGESTED");
    partyIds.push(seller.party.id, buyer.party.id);
    await loginAs(seller.user.id);
    await respondToMatch(formData({ id: match.id, decision: "ACCEPTED" }));
    await loginAs(buyer.user.id);
    await respondToMatch(formData({ id: match.id, decision: "ACCEPTED" }));

    await loginAs(seller.user.id);
    await respondToMatch(formData({ id: match.id, decision: "DECLINED" }));

    expect(await prisma.agreementCancellation.findUnique({ where: { matchId: match.id } }))
      .toMatchObject({ cancelledById: seller.party.id });
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

describe("proposeMatchTerms", () => {
  const partyIds: string[] = [];
  beforeEach(() => resetNextRuntime());
  afterEach(async () => cleanupParties(partyIds.splice(0)));

  it("records the handover date the parties put on the table", async () => {
    const { seller, buyer, match } = await setUpMatchedPair("SUGGESTED");
    partyIds.push(seller.party.id, buyer.party.id);
    await loginAs(buyer.user.id);

    await proposeMatchTerms(formData({
      matchId: match.id,
      quantity: "15",
      unit: "tonne",
      price: "500",
      priceBasis: "PER_UNIT",
      priceCurrency: "USD",
      priceUnit: "tonne",
      handoverOn: "2026-09-20",
    }));

    const terms = await prisma.agreementTerms.findFirstOrThrow({ where: { matchId: match.id } });
    expect(terms.handoverOn?.toISOString()).toBe("2026-09-20T00:00:00.000Z");
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

  // Scenario I. Counting two rows and calling it done meant a disagreement
  // produced a COMPLETED trade — and COMPLETED is also what unlocks personal
  // contact details, so the fiction escaped the label.
  it("does not record a completed trade when the two sides disagree about whether it happened", async () => {
    const { seller, buyer, match } = await setUpMatchedPair("ACCEPTED");
    partyIds.push(seller.party.id, buyer.party.id);

    await loginAs(seller.user.id);
    await confirmMatch({}, formData({ matchId: match.id, outcome: "COMPLETED_GOOD" }));
    await loginAs(buyer.user.id);
    await confirmMatch({}, formData({ matchId: match.id, outcome: "DID_NOT_HAPPEN" }));

    const after = await prisma.match.findUnique({ where: { id: match.id } });
    expect(after!.status).not.toBe("COMPLETED");

    // Both reports survive. FarmaTrade holds the evidence; it does not judge.
    const reports = await prisma.transactionConfirmation.findMany({
      where: { matchId: match.id },
      select: { outcome: true },
    });
    expect(reports.map((r) => r.outcome).sort()).toEqual(["COMPLETED_GOOD", "DID_NOT_HAPPEN"]);
  });

  it("does not leak contact details on the strength of a disputed trade", async () => {
    const { seller, buyer, match } = await setUpMatchedPair("ACCEPTED");
    partyIds.push(seller.party.id, buyer.party.id);

    await loginAs(seller.user.id);
    await confirmMatch({}, formData({ matchId: match.id, outcome: "COMPLETED_GOOD" }));
    await loginAs(buyer.user.id);
    await confirmMatch({}, formData({ matchId: match.id, outcome: "DID_NOT_HAPPEN" }));

    const { canSeeContactDetails } = await import("@/lib/identity-safety");
    expect(await canSeeContactDetails(seller.party.id, buyer.party.id)).toBe(false);
  });

  it("records an agreed non-event as a non-event rather than a completed trade", async () => {
    const { seller, buyer, match } = await setUpMatchedPair("ACCEPTED");
    partyIds.push(seller.party.id, buyer.party.id);

    await loginAs(seller.user.id);
    await confirmMatch({}, formData({ matchId: match.id, outcome: "DID_NOT_HAPPEN" }));
    await loginAs(buyer.user.id);
    await confirmMatch({}, formData({ matchId: match.id, outcome: "DID_NOT_HAPPEN" }));

    const after = await prisma.match.findUnique({ where: { id: match.id } });
    expect(after!.status).not.toBe("COMPLETED");
  });

  it("still completes a trade that happened but went badly for one side", async () => {
    const { seller, buyer, match } = await setUpMatchedPair("ACCEPTED");
    partyIds.push(seller.party.id, buyer.party.id);

    await loginAs(seller.user.id);
    await confirmMatch({}, formData({ matchId: match.id, outcome: "COMPLETED_GOOD" }));
    await loginAs(buyer.user.id);
    await confirmMatch({}, formData({ matchId: match.id, outcome: "COMPLETED_ISSUE" }));

    const after = await prisma.match.findUnique({ where: { id: match.id } });
    expect(after!.status).toBe("COMPLETED");
  });
});

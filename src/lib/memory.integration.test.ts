// Integration test for the two pipelines that only exist end-to-end: a
// completed trade writing operational memory for both sides, and per-
// dimension ratings aggregating onto Reputation. Both run inside
// confirmMatch's transaction, so a unit test against the pure cores can't
// prove they're actually wired up.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeCookies, resetNextRuntime } from "@/test/next-runtime-stub";
import {
  createTestParty,
  createTestPost,
  createTestMatch,
  createTestMemoryEvent,
  cleanupParties,
} from "@/test/factories";

vi.mock("next/headers", () => ({
  cookies: async () => fakeCookies,
  headers: async () => ({ get: () => null }),
}));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { confirmMatch } = await import("@/app/dashboard/opportunities/actions");
const { createSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { getPartyMemory } = await import("@/lib/memory");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

async function loginAs(userId: string) {
  await createSession(userId, 0);
}

async function setUpAcceptedTrade() {
  const seller = await createTestParty({ region: "Harare", locality: "Harare" });
  const buyer = await createTestParty({ region: "Harare", locality: "Harare" });
  const have = await createTestPost(seller.party.id, {
    objective: "SELL",
    category: "PRODUCE",
    title: "3 tonnes of oranges",
  });
  const need = await createTestPost(buyer.party.id, { objective: "BUY", category: "PRODUCE" });
  const match = await createTestMatch(have.id, need.id, "ACCEPTED");
  return { seller, buyer, match };
}

describe("operational memory from completed trades", () => {
  const partyIds: string[] = [];
  beforeEach(() => resetNextRuntime());
  afterEach(async () => {
    await cleanupParties(partyIds.splice(0));
  });

  it("records nothing until both sides have confirmed", async () => {
    const { seller, buyer, match } = await setUpAcceptedTrade();
    partyIds.push(seller.party.id, buyer.party.id);

    await loginAs(seller.user.id);
    await confirmMatch({}, formData({ matchId: match.id, outcome: "COMPLETED_GOOD" }));

    const events = await prisma.memoryEvent.findMany({ where: { matchId: match.id } });
    expect(events).toEqual([]);
  });

  it("records one event per side, from each party's own point of view", async () => {
    const { seller, buyer, match } = await setUpAcceptedTrade();
    partyIds.push(seller.party.id, buyer.party.id);

    await loginAs(seller.user.id);
    await confirmMatch({}, formData({ matchId: match.id, outcome: "COMPLETED_GOOD" }));
    await loginAs(buyer.user.id);
    await confirmMatch({}, formData({ matchId: match.id, outcome: "COMPLETED_GOOD" }));

    const events = await prisma.memoryEvent.findMany({ where: { matchId: match.id } });
    expect(events).toHaveLength(2);

    const sellerEvent = events.find((e) => e.partyId === seller.party.id)!;
    const buyerEvent = events.find((e) => e.partyId === buyer.party.id)!;

    expect(sellerEvent.kind).toBe("SOLD");
    expect(buyerEvent.kind).toBe("BOUGHT");
    // Both remember the same thing, each pointing at the other.
    expect(sellerEvent.subject).toBe("3 tonnes of oranges");
    expect(buyerEvent.subject).toBe("3 tonnes of oranges");
    expect(sellerEvent.counterpartyId).toBe(buyer.party.id);
    expect(buyerEvent.counterpartyId).toBe(seller.party.id);
  });

  it("records a rental as a rental, not a sale", async () => {
    const owner = await createTestParty({ region: "Harare", locality: "Harare" });
    const renter = await createTestParty({ region: "Harare", locality: "Harare" });
    partyIds.push(owner.party.id, renter.party.id);

    const offer = await createTestPost(owner.party.id, {
      objective: "RENT_OUT",
      category: "EQUIPMENT",
      title: "Tractor",
    });
    const want = await createTestPost(renter.party.id, {
      objective: "RENT",
      category: "EQUIPMENT",
    });
    const match = await createTestMatch(offer.id, want.id, "ACCEPTED");

    await loginAs(owner.user.id);
    await confirmMatch({}, formData({ matchId: match.id, outcome: "COMPLETED_GOOD" }));
    await loginAs(renter.user.id);
    await confirmMatch({}, formData({ matchId: match.id, outcome: "COMPLETED_GOOD" }));

    const events = await prisma.memoryEvent.findMany({ where: { matchId: match.id } });
    expect(events.find((e) => e.partyId === owner.party.id)!.kind).toBe("EQUIPMENT_RENTED_OUT");
    expect(events.find((e) => e.partyId === renter.party.id)!.kind).toBe("EQUIPMENT_RENTED_IN");
  });

  it("turns a repeated seasonal history into an anticipation", async () => {
    const { party } = await createTestParty();
    partyIds.push(party.id);

    const today = new Date("2026-08-10T00:00:00Z");
    await createTestMemoryEvent(party.id, {
      kind: "SOLD",
      subject: "oranges",
      occurredAt: new Date("2024-08-11T00:00:00Z"),
    });
    await createTestMemoryEvent(party.id, {
      kind: "SOLD",
      subject: "oranges",
      occurredAt: new Date("2025-08-09T00:00:00Z"),
    });

    const memory = await getPartyMemory(party.id, today);
    expect(memory.anticipations).toHaveLength(1);
    expect(memory.anticipations[0].subject).toBe("oranges");
  });
});

describe("multidimensional trust aggregation", () => {
  const partyIds: string[] = [];
  beforeEach(() => resetNextRuntime());
  afterEach(async () => {
    await cleanupParties(partyIds.splice(0));
  });

  it("aggregates per-dimension scores onto the rated party's reputation", async () => {
    const { seller, buyer, match } = await setUpAcceptedTrade();
    partyIds.push(seller.party.id, buyer.party.id);

    await loginAs(buyer.user.id);
    const result = await confirmMatch(
      {},
      formData({
        matchId: match.id,
        outcome: "COMPLETED_GOOD",
        score: "4",
        quality: "5",
        communication: "3",
      }),
    );
    expect(result.error).toBeUndefined();

    const rep = await prisma.reputation.findUnique({ where: { partyId: seller.party.id } });
    expect(rep!.qualityAvg).toBe(5);
    expect(rep!.communicationAvg).toBe(3);
    // Untouched dimensions stay null rather than inheriting the overall
    // score — an unanswered question is not a middling answer.
    expect(rep!.paymentAvg).toBeNull();
    expect(rep!.dimensionCount).toBe(1);
  });

  it("leaves every dimension null when the rater only moved the overall slider", async () => {
    const { seller, buyer, match } = await setUpAcceptedTrade();
    partyIds.push(seller.party.id, buyer.party.id);

    await loginAs(buyer.user.id);
    await confirmMatch({}, formData({ matchId: match.id, outcome: "COMPLETED_GOOD", score: "5" }));

    const rep = await prisma.reputation.findUnique({ where: { partyId: seller.party.id } });
    expect(rep!.averageRating).toBe(5);
    expect(rep!.qualityAvg).toBeNull();
    expect(rep!.dimensionCount).toBe(0);
  });

  it("counts a counterparty as a repeat partner only after a second completed trade", async () => {
    const seller = await createTestParty({ region: "Harare", locality: "Harare" });
    const buyer = await createTestParty({ region: "Harare", locality: "Harare" });
    partyIds.push(seller.party.id, buyer.party.id);

    async function completeOneTrade() {
      const have = await createTestPost(seller.party.id, { objective: "SELL" });
      const need = await createTestPost(buyer.party.id, { objective: "BUY" });
      const match = await createTestMatch(have.id, need.id, "ACCEPTED");
      await loginAs(seller.user.id);
      await confirmMatch({}, formData({ matchId: match.id, outcome: "COMPLETED_GOOD" }));
      await loginAs(buyer.user.id);
      await confirmMatch({}, formData({ matchId: match.id, outcome: "COMPLETED_GOOD" }));
    }

    await completeOneTrade();
    let rep = await prisma.reputation.findUnique({ where: { partyId: seller.party.id } });
    expect(rep!.repeatPartnerCount).toBe(0);

    await completeOneTrade();
    rep = await prisma.reputation.findUnique({ where: { partyId: seller.party.id } });
    expect(rep!.repeatPartnerCount).toBe(1);
  });
});

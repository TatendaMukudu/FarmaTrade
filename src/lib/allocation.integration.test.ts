// Commercial capacity against a real Postgres.
//
// The arithmetic is covered in capacity.test.ts. What this file exists for
// is the set of promises that can only be checked against real rows and a
// real transaction: that inventory never moves, that the same quantity is
// never deducted twice, that a released engagement gives its capacity back,
// and that two concurrent allocations cannot between them promise more than
// exists.
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  allocateForMatch,
  loadCapacity,
  releaseAllocation,
  syncEngagementForMatch,
} from "@/lib/allocation";
import { generateMatchesForIntent } from "@/lib/matching";
import { isMatchable } from "@/lib/intent";
import { createTestParty, createTestIntent, createTestMatch, cleanupParties } from "@/test/factories";

describe("commercial capacity", () => {
  const partyIds: string[] = [];
  afterEach(async () => {
    await cleanupParties(partyIds.splice(0));
  });

  async function party() {
    const { party } = await createTestParty({ roles: ["FARM"] });
    partyIds.push(party.id);
    return party;
  }

  // A supply intent for `quantity` tonnes, and a buyer with a matching need.
  async function market(supplyQty: number | null, demandQty: number | null, unit = "tonne") {
    const seller = await party();
    const buyer = await party();
    const supply = await createTestIntent(seller.id, {
      side: "SUPPLY",
      quantity: supplyQty,
      unit: supplyQty == null ? null : unit,
    });
    const demand = await createTestIntent(buyer.id, {
      side: "DEMAND",
      quantity: demandQty,
      unit: demandQty == null ? null : unit,
    });
    return { seller, buyer, supply, demand };
  }

  const remainingOf = async (intentId: string) => (await loadCapacity(intentId))?.remaining;

  // ------------------------------------------------------------------
  // A. Inventory remains physical truth
  // ------------------------------------------------------------------
  it("leaves inventory alone when an intent authorizes less than the farm holds", async () => {
    const seller = await party();
    const farm = await prisma.farm.create({ data: { partyId: seller.id, farmName: "Test Farm" } });
    const produce = await prisma.produceStock.create({
      data: { farmId: farm.id, cropType: "Maize", quantity: 26, unit: "TONNE" },
    });

    // The farmer keeps six tonnes back and offers twenty.
    const supply = await createTestIntent(seller.id, {
      side: "SUPPLY",
      quantity: 20,
      unit: "tonne",
    });
    await prisma.intent.update({ where: { id: supply.id }, data: { produceId: produce.id } });

    const stock = await prisma.produceStock.findUnique({ where: { id: produce.id } });
    expect(stock!.quantity).toBe(26);
    expect((await prisma.intent.findUnique({ where: { id: supply.id } }))!.quantity).toBe(20);
    expect(await remainingOf(supply.id)).toBe(20);
  });

  // ------------------------------------------------------------------
  // B. Partial allocation
  // ------------------------------------------------------------------
  it("leaves 12 of 20 available after an 8-tonne engagement, and moves no stock", async () => {
    const seller = await party();
    const buyer = await party();
    const farm = await prisma.farm.create({ data: { partyId: seller.id, farmName: "F" } });
    const produce = await prisma.produceStock.create({
      data: { farmId: farm.id, cropType: "Maize", quantity: 26, unit: "TONNE" },
    });
    const supply = await createTestIntent(seller.id, { side: "SUPPLY", quantity: 20, unit: "tonne" });
    await prisma.intent.update({ where: { id: supply.id }, data: { produceId: produce.id } });
    const demand = await createTestIntent(buyer.id, { side: "DEMAND", quantity: 8, unit: "tonne" });

    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    const result = await allocateForMatch(match.id);

    expect(result).toMatchObject({ ok: true, quantity: 8 });
    expect(await remainingOf(supply.id)).toBe(12);
    expect((await prisma.produceStock.findUnique({ where: { id: produce.id } }))!.quantity).toBe(26);
  });

  // ------------------------------------------------------------------
  // C. Allocation becomes commitment without being deducted twice
  // ------------------------------------------------------------------
  it("does not deduct the same 8 tonnes again when the engagement completes", async () => {
    const { supply, demand } = await market(20, 8);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    await allocateForMatch(match.id);
    expect(await remainingOf(supply.id)).toBe(12);

    // The same row moves ACCEPTED -> COMPLETED. There is no second record
    // for the commitment to live in, which is what makes the double
    // deduction structurally impossible rather than merely avoided.
    await prisma.match.update({ where: { id: match.id }, data: { status: "COMPLETED" } });

    expect(await remainingOf(supply.id)).toBe(12);
    const row = await prisma.match.findUnique({ where: { id: match.id } });
    expect(row!.quantity).toBe(8);
  });

  it("re-prices an existing engagement instead of subtracting it a second time", async () => {
    const { supply, demand } = await market(20, 20);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    await allocateForMatch(match.id, 8);
    expect(await remainingOf(supply.id)).toBe(12);

    // Agreeing the same engagement again at 10 must read the existing 8 as
    // this match's own claim, not somebody else's.
    await allocateForMatch(match.id, 10);
    expect(await remainingOf(supply.id)).toBe(10);
  });

  // ------------------------------------------------------------------
  // D. Multiple allocations
  // ------------------------------------------------------------------
  it("leaves 7 of 20 after engagements of 8 and 5", async () => {
    const seller = await party();
    const supply = await createTestIntent(seller.id, { side: "SUPPLY", quantity: 20, unit: "tonne" });

    for (const qty of [8, 5]) {
      const buyer = await party();
      const demand = await createTestIntent(buyer.id, { side: "DEMAND", quantity: qty, unit: "tonne" });
      const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
      await allocateForMatch(match.id);
    }

    expect(await remainingOf(supply.id)).toBe(7);
  });

  // ------------------------------------------------------------------
  // E/G. Capacity exhaustion removes an intent from matching
  // ------------------------------------------------------------------
  it("stops offering an intent once every tonne is spoken for", async () => {
    const { supply, demand } = await market(20, 20);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    await allocateForMatch(match.id);

    const capacity = await loadCapacity(supply.id);
    expect(capacity!.remaining).toBe(0);

    const row = await prisma.intent.findUnique({ where: { id: supply.id } });
    expect(isMatchable({ status: row!.status, remaining: capacity!.remaining })).toBe(false);
  });

  // ------------------------------------------------------------------
  // F. An engaged intent with capacity left stays on the market
  // ------------------------------------------------------------------
  it("keeps finding buyers for the 12 tonnes a farmer has not agreed away", async () => {
    // This is the behaviour the old status-only predicate destroyed: one
    // 8-tonne handshake took the whole 20-tonne intent off the market.
    const { supply, demand } = await market(20, 8);
    const first = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    await allocateForMatch(first.id);

    const engaged = await prisma.intent.findUnique({ where: { id: supply.id } });
    expect(engaged!.status).toBe("ENGAGED");

    // A second buyer arrives.
    const second = await party();
    const otherDemand = await createTestIntent(second.id, {
      side: "DEMAND",
      quantity: 12,
      unit: "tonne",
    });
    await generateMatchesForIntent(otherDemand.id);

    const matches = await prisma.match.findMany({
      where: { OR: [{ intentAId: otherDemand.id }, { intentBId: otherDemand.id }] },
    });
    expect(matches).toHaveLength(1);
    expect([matches[0].intentAId, matches[0].intentBId]).toContain(supply.id);
  });

  it("stops proposing an exhausted intent to new counterparties", async () => {
    const { supply, demand } = await market(20, 20);
    const first = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    await allocateForMatch(first.id);

    const second = await party();
    const otherDemand = await createTestIntent(second.id, {
      side: "DEMAND",
      quantity: 5,
      unit: "tonne",
    });
    await generateMatchesForIntent(otherDemand.id);

    const matches = await prisma.match.findMany({
      where: { OR: [{ intentAId: otherDemand.id }, { intentBId: otherDemand.id }] },
    });
    expect(matches).toHaveLength(0);
  });

  // ------------------------------------------------------------------
  // H/I. Permission beats quantity
  // ------------------------------------------------------------------
  it("never matches a proposal the farmer has not agreed to, however much it offers", async () => {
    const seller = await party();
    const buyer = await party();
    await createTestIntent(seller.id, {
      side: "SUPPLY",
      status: "PROPOSED",
      quantity: 100,
      unit: "tonne",
    });
    const demand = await createTestIntent(buyer.id, { side: "DEMAND", quantity: 20, unit: "tonne" });

    await generateMatchesForIntent(demand.id);
    expect(await prisma.match.count({ where: { intentBId: demand.id } })).toBe(0);
  });

  it("never matches a withdrawn intent, however much it offered", async () => {
    const seller = await party();
    const buyer = await party();
    await createTestIntent(seller.id, {
      side: "SUPPLY",
      status: "WITHDRAWN",
      quantity: 100,
      unit: "tonne",
    });
    const demand = await createTestIntent(buyer.id, { side: "DEMAND", quantity: 20, unit: "tonne" });

    await generateMatchesForIntent(demand.id);
    expect(await prisma.match.count({ where: { intentBId: demand.id } })).toBe(0);
  });

  // ------------------------------------------------------------------
  // J. Demand aggregation — the same primitive, from the buyer's side
  // ------------------------------------------------------------------
  it("leaves 30 of a 100-tonne order outstanding after 30 and 40 are agreed", async () => {
    const buyer = await party();
    const demand = await createTestIntent(buyer.id, {
      side: "DEMAND",
      quantity: 100,
      unit: "tonne",
    });

    for (const qty of [30, 40]) {
      const seller = await party();
      const supply = await createTestIntent(seller.id, {
        side: "SUPPLY",
        quantity: qty,
        unit: "tonne",
      });
      const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
      const result = await allocateForMatch(match.id);
      expect(result).toMatchObject({ ok: true, quantity: qty });
    }

    expect(await remainingOf(demand.id)).toBe(30);
    // And the demand is still live, because it still needs 30.
    const row = await prisma.intent.findUnique({ where: { id: demand.id } });
    expect(isMatchable({ status: row!.status, remaining: 30 })).toBe(true);
  });

  // ------------------------------------------------------------------
  // K. No over-allocation
  // ------------------------------------------------------------------
  it("clamps a request to what is actually left rather than over-promising", async () => {
    const { supply, demand } = await market(10, 50);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    const result = await allocateForMatch(match.id, 18);

    expect(result).toMatchObject({ ok: true, quantity: 10 });
    expect(await remainingOf(supply.id)).toBe(0);
  });

  it("cannot be talked past ten tonnes by two engagements at once", async () => {
    // Both transactions read the same ten tonnes before either writes. The
    // row lock is what makes the second one wait and see the first.
    const seller = await party();
    const supply = await createTestIntent(seller.id, { side: "SUPPLY", quantity: 10, unit: "tonne" });

    const matches = [];
    for (let i = 0; i < 2; i++) {
      const buyer = await party();
      const demand = await createTestIntent(buyer.id, {
        side: "DEMAND",
        quantity: 8,
        unit: "tonne",
      });
      matches.push(await createTestMatch(supply.id, demand.id, "SUGGESTED"));
    }

    const results = await Promise.all(matches.map((m) => allocateForMatch(m.id, 8)));

    const allocated = results.reduce(
      (sum, r) => sum + (r.ok && r.quantity ? r.quantity : 0),
      0,
    );
    expect(allocated).toBeLessThanOrEqual(10);
    expect(await remainingOf(supply.id)).toBe(10 - allocated);
    expect(await remainingOf(supply.id)).toBeGreaterThanOrEqual(0);
  });

  // ------------------------------------------------------------------
  // L. A released engagement returns its capacity, and moves no stock
  // ------------------------------------------------------------------
  it("puts 8 tonnes back on the market when an engagement is declined", async () => {
    const seller = await party();
    const buyer = await party();
    const farm = await prisma.farm.create({ data: { partyId: seller.id, farmName: "F" } });
    const produce = await prisma.produceStock.create({
      data: { farmId: farm.id, cropType: "Maize", quantity: 26, unit: "TONNE" },
    });
    const supply = await createTestIntent(seller.id, { side: "SUPPLY", quantity: 20, unit: "tonne" });
    await prisma.intent.update({ where: { id: supply.id }, data: { produceId: produce.id } });
    const demand = await createTestIntent(buyer.id, { side: "DEMAND", quantity: 8, unit: "tonne" });

    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    await allocateForMatch(match.id);
    expect(await remainingOf(supply.id)).toBe(12);

    await releaseAllocation(match.id);

    expect(await remainingOf(supply.id)).toBe(20);
    // Back to available, not stuck describing a negotiation that ended.
    expect((await prisma.intent.findUnique({ where: { id: supply.id } }))!.status).toBe("ACTIVE");
    // And nothing physical ever moved, in either direction.
    expect((await prisma.produceStock.findUnique({ where: { id: produce.id } }))!.quantity).toBe(26);
  });

  it("releases capacity held by a trade someone reported never happened", async () => {
    const { seller, buyer, supply, demand } = await market(20, 8);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    await allocateForMatch(match.id);
    await prisma.match.update({ where: { id: match.id }, data: { status: "COMPLETED" } });

    await prisma.transactionConfirmation.createMany({
      data: [
        { matchId: match.id, partyId: seller.id, outcome: "DID_NOT_HAPPEN" },
        { matchId: match.id, partyId: buyer.id, outcome: "DID_NOT_HAPPEN" },
      ],
    });
    await syncEngagementForMatch(match.id);

    // A trade that fell through consumed nothing. Leaving it holding eight
    // tonnes would strand a farmer's supply behind a deal that never
    // occurred.
    expect(await remainingOf(supply.id)).toBe(20);
    expect((await prisma.intent.findUnique({ where: { id: supply.id } }))!.status).toBe("ACTIVE");
  });

  // ------------------------------------------------------------------
  // Units, and the refusal to invent precision
  // ------------------------------------------------------------------
  it("records an engagement without a quantity rather than comparing tonnes with bags", async () => {
    const seller = await party();
    const buyer = await party();
    const supply = await createTestIntent(seller.id, { side: "SUPPLY", quantity: 20, unit: "tonne" });
    const demand = await createTestIntent(buyer.id, { side: "DEMAND", quantity: 30, unit: "bag" });

    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    const result = await allocateForMatch(match.id);

    // The parties can still trade. FarmaTrade simply will not say how much
    // until it has a conversion it can defend.
    expect(result).toMatchObject({ ok: true, quantity: null });
    expect(await remainingOf(supply.id)).toBe(20);
    expect((await prisma.intent.findUnique({ where: { id: supply.id } }))!.status).toBe("ENGAGED");
  });

  it("treats an intent with no stated quantity as having no ceiling", async () => {
    const { supply, demand } = await market(null, 30);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    const result = await allocateForMatch(match.id);

    expect(result).toMatchObject({ ok: true, quantity: null });
    expect(await remainingOf(supply.id)).toBeNull();
    // Still matchable, because no ceiling was ever declared to reach.
    const row = await prisma.intent.findUnique({ where: { id: supply.id } });
    expect(isMatchable({ status: row!.status, remaining: null })).toBe(true);
  });

  // ------------------------------------------------------------------
  // The P0.2C ownership rule still holds underneath all of this
  // ------------------------------------------------------------------
  it("never moves an intent out of PROPOSED or WITHDRAWN through market activity", async () => {
    const seller = await party();
    const buyer = await party();
    const proposed = await createTestIntent(seller.id, {
      side: "SUPPLY",
      status: "PROPOSED",
      quantity: 20,
      unit: "tonne",
    });
    const demand = await createTestIntent(buyer.id, { side: "DEMAND", quantity: 8, unit: "tonne" });
    const match = await createTestMatch(proposed.id, demand.id, "SUGGESTED");

    const result = await allocateForMatch(match.id);

    expect(result).toEqual({ ok: false, reason: "not_authorized" });
    expect((await prisma.intent.findUnique({ where: { id: proposed.id } }))!.status).toBe("PROPOSED");
    expect((await prisma.match.findUnique({ where: { id: match.id } }))!.status).toBe("SUGGESTED");
  });
});

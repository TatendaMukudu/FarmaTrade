// Bilateral agreement against a real Postgres.
//
// The consent rules are pure and covered in agreement-core.test.ts. What
// this file exists for is the set of promises that can only be checked
// against real rows and a real transaction: that one party acting alone
// takes nothing from the other, that the second acceptance is the moment
// capacity moves and is checked while it moves, that a renegotiation does
// not double-count itself or destroy the deal it failed to replace, and
// that inventory never moves at any point in any of it.
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { acceptTerms, closeEngagement, proposeTerms } from "@/lib/agreement";
import { loadCapacity } from "@/lib/allocation";
import { generateMatchesForIntent } from "@/lib/matching";
import { createTestParty, createTestIntent, createTestMatch, cleanupParties } from "@/test/factories";

describe("bilateral agreement", () => {
  const partyIds: string[] = [];
  afterEach(async () => {
    await cleanupParties(partyIds.splice(0));
  });

  async function party() {
    const { party } = await createTestParty({ roles: ["FARM"] });
    partyIds.push(party.id);
    return party;
  }

  // A farm holding `stock` tonnes, authorizing `authorized` of them.
  async function farmerOffering(authorized: number | null, stock = 26, unit = "tonne") {
    const seller = await party();
    const farm = await prisma.farm.create({ data: { partyId: seller.id, farmName: "Test Farm" } });
    const produce = await prisma.produceStock.create({
      data: { farmId: farm.id, cropType: "Maize", quantity: stock, unit: "TONNE" },
    });
    const supply = await createTestIntent(seller.id, {
      side: "SUPPLY",
      quantity: authorized,
      unit: authorized == null ? null : unit,
    });
    await prisma.intent.update({ where: { id: supply.id }, data: { produceId: produce.id } });
    return { seller, produce, supply };
  }

  async function buyerNeeding(quantity: number | null, unit = "tonne") {
    const buyer = await party();
    const demand = await createTestIntent(buyer.id, {
      side: "DEMAND",
      quantity,
      unit: quantity == null ? null : unit,
    });
    return { buyer, demand };
  }

  const remainingOf = async (intentId: string) => (await loadCapacity(intentId))?.remaining;

  // Capacity reports canonical quantities, and the canonical basis for mass
  // is the kilogram. Every fixture in this file is denominated in tonnes, so
  // expectations are written in tonnes and converted here rather than as
  // bare thousands — the point being tested is the agreement rules, and a
  // wall of 12000s would obscure that the number is twelve tonnes.
  const kg = (tonnes: number) => tonnes * 1000;
  const stockOf = async (id: string) =>
    (await prisma.produceStock.findUnique({ where: { id } }))!.quantity;
  const statusOf = async (matchId: string) =>
    (await prisma.match.findUnique({ where: { id: matchId } }))!.status;

  // ------------------------------------------------------------------
  // A. One party acting alone takes nothing from the other
  // ------------------------------------------------------------------
  it("does not touch a farmer's capacity when the buyer alone accepts", async () => {
    // This is the bug the whole phase exists to fix. Before bilateral
    // agreement, this sequence reserved 10 of the farmer's tonnes on a
    // stranger's say-so.
    const { supply, produce } = await farmerOffering(26, 26);
    const { buyer, demand } = await buyerNeeding(10);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    const result = await proposeTerms(match.id, buyer.id, { quantity: 10, unit: "tonne" });

    expect(result).toMatchObject({ ok: true, status: "proposed", version: 1 });
    expect(await remainingOf(supply.id)).toBe(kg(26));
    expect(await statusOf(match.id)).toBe("NEGOTIATING");
    expect(await stockOf(produce.id)).toBe(26);
  });

  it("does not touch a buyer's demand when the farmer alone accepts", async () => {
    const { seller, supply } = await farmerOffering(26, 26);
    const { demand } = await buyerNeeding(10);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, seller.id, { quantity: 10, unit: "tonne" });

    expect(await remainingOf(demand.id)).toBe(kg(10));
  });

  // ------------------------------------------------------------------
  // B/C. The second acceptance is what moves capacity, either direction
  // ------------------------------------------------------------------
  it("reserves 10 of 26 once the farmer agrees to the buyer's terms", async () => {
    const { seller, supply, produce } = await farmerOffering(26, 26);
    const { buyer, demand } = await buyerNeeding(10);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, buyer.id, { quantity: 10, unit: "tonne" });
    expect(await remainingOf(supply.id)).toBe(kg(26));

    const result = await acceptTerms(match.id, seller.id);

    expect(result).toMatchObject({ ok: true, status: "agreed" });
    expect(await remainingOf(supply.id)).toBe(kg(16));
    expect(await remainingOf(demand.id)).toBe(kg(0));
    expect(await statusOf(match.id)).toBe("AGREED");
    // K. Nothing physical moved.
    expect(await stockOf(produce.id)).toBe(26);
  });

  it("works the same way when the farmer proposes and the buyer agrees", async () => {
    const { seller, supply } = await farmerOffering(26, 26);
    const { buyer, demand } = await buyerNeeding(10);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, seller.id, { quantity: 10, unit: "tonne" });
    expect(await remainingOf(supply.id)).toBe(kg(26));

    await acceptTerms(match.id, buyer.id);

    expect(await remainingOf(supply.id)).toBe(kg(16));
  });

  // ------------------------------------------------------------------
  // D/E. Consent is to a version, and never carries forward
  // ------------------------------------------------------------------
  it("does not claim agreement when each party accepted different terms", async () => {
    const { seller, supply } = await farmerOffering(26, 26);
    const { buyer, demand } = await buyerNeeding(20);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    // The farmer offers 10. The buyer, rather than agreeing, asks for 12.
    await proposeTerms(match.id, seller.id, { quantity: 10, unit: "tonne" });
    await proposeTerms(match.id, buyer.id, { quantity: 12, unit: "tonne" });

    // Two versions, one acceptance each. Nothing is agreed and nothing is
    // reserved, however many times somebody clicked.
    expect(await statusOf(match.id)).toBe("NEGOTIATING");
    expect(await remainingOf(supply.id)).toBe(kg(26));

    // Only when the farmer answers the 12 does it become an agreement.
    await acceptTerms(match.id, seller.id);
    expect(await statusOf(match.id)).toBe("AGREED");
    expect(await remainingOf(supply.id)).toBe(kg(14));
  });

  it("serializes simultaneous counteroffers into distinct versions", async () => {
    const { seller, supply } = await farmerOffering(26, 26);
    const { buyer, demand } = await buyerNeeding(20);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    const results = await Promise.all([
      proposeTerms(match.id, seller.id, { quantity: 10, unit: "tonne" }),
      proposeTerms(match.id, buyer.id, { quantity: 12, unit: "tonne" }),
    ]);

    expect(results.every((result) => result.ok)).toBe(true);
    const terms = await prisma.agreementTerms.findMany({
      where: { matchId: match.id },
      orderBy: { version: "asc" },
    });
    expect(terms.map((term) => term.version)).toEqual([1, 2]);
  });

  it("will not let a changed quantity inherit the old consent", async () => {
    const { seller, supply } = await farmerOffering(26, 26);
    const { buyer, demand } = await buyerNeeding(20);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, seller.id, { quantity: 10, unit: "tonne" });
    await acceptTerms(match.id, buyer.id);
    expect(await remainingOf(supply.id)).toBe(kg(16));

    // The buyer now wants 15. Their own consent moves to the new version;
    // the farmer's does not follow it.
    await proposeTerms(match.id, buyer.id, { quantity: 15, unit: "tonne" });

    const versions = await prisma.agreementTerms.findMany({
      where: { matchId: match.id },
      include: { acceptances: true },
      orderBy: { version: "asc" },
    });
    expect(versions).toHaveLength(2);
    expect(versions[1].acceptances.map((a) => a.partyId)).toEqual([buyer.id]);

    // And the 10-tonne deal is still the one in force — not 15, and not
    // nothing.
    expect(await remainingOf(supply.id)).toBe(kg(16));
    expect(await statusOf(match.id)).toBe("AGREED");
  });

  // ------------------------------------------------------------------
  // F. Concurrent finalization cannot oversubscribe
  // ------------------------------------------------------------------
  it("lets at most one of two concurrent agreements take the last tonnes", async () => {
    const { seller, supply } = await farmerOffering(10, 26);

    const matches = [];
    for (let i = 0; i < 2; i++) {
      const { buyer, demand } = await buyerNeeding(8);
      const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
      await proposeTerms(match.id, buyer.id, { quantity: 8, unit: "tonne" });
      matches.push(match);
    }

    // Both farmer acceptances race for the same ten tonnes.
    const results = await Promise.all(matches.map((m) => acceptTerms(m.id, seller.id)));

    const agreed = results.filter((r) => r.ok && r.status === "agreed");
    expect(agreed).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toMatchObject([{ reason: "insufficient_capacity" }]);
    expect(await remainingOf(supply.id)).toBe(kg(2));
  });

  // ------------------------------------------------------------------
  // G/H. Renegotiation
  // ------------------------------------------------------------------
  it("weighs a renegotiation against its own existing agreement, not on top of it", async () => {
    // 6 of 10 agreed. Replacing them with 8 must be checked against the 6
    // being released, not against the 4 that would be left if they were not.
    const { seller, supply } = await farmerOffering(10, 26);
    const { buyer, demand } = await buyerNeeding(10);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, seller.id, { quantity: 6, unit: "tonne" });
    await acceptTerms(match.id, buyer.id);
    expect(await remainingOf(supply.id)).toBe(kg(4));

    await proposeTerms(match.id, buyer.id, { quantity: 8, unit: "tonne" });
    const result = await acceptTerms(match.id, seller.id);

    expect(result).toMatchObject({ ok: true, status: "agreed", version: 2 });
    expect(await remainingOf(supply.id)).toBe(kg(2));
  });

  it("keeps the old agreement when a renegotiation does not fit", async () => {
    const { seller, supply } = await farmerOffering(10, 26);
    const { buyer, demand } = await buyerNeeding(20);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, seller.id, { quantity: 6, unit: "tonne" });
    await acceptTerms(match.id, buyer.id);

    // Another buyer takes 4, leaving nothing spare.
    const second = await buyerNeeding(4);
    const otherMatch = await createTestMatch(supply.id, second.demand.id, "SUGGESTED");
    await proposeTerms(otherMatch.id, second.buyer.id, { quantity: 4, unit: "tonne" });
    await acceptTerms(otherMatch.id, seller.id);
    expect(await remainingOf(supply.id)).toBe(kg(0));

    // Now try to grow the first deal from 6 to 9. It cannot fit: 9 + 4 > 10.
    await proposeTerms(match.id, buyer.id, { quantity: 9, unit: "tonne" });
    const result = await acceptTerms(match.id, seller.id);

    expect(result).toEqual({ ok: false, reason: "insufficient_capacity" });
    // The 6-tonne deal survives untouched. A failed replacement must never
    // destroy the thing it failed to replace.
    expect(await statusOf(match.id)).toBe("AGREED");
    expect(await remainingOf(supply.id)).toBe(kg(0));
    const terms = await prisma.agreementTerms.findMany({
      where: { matchId: match.id },
      include: { acceptances: true },
      orderBy: { version: "asc" },
    });
    expect(terms[0].acceptances).toHaveLength(2);
    expect(terms[1].acceptances).toHaveLength(1);
  });

  // ------------------------------------------------------------------
  // I. Cancellation releases, and moves no stock
  // ------------------------------------------------------------------
  it("returns the capacity of a cancelled agreement", async () => {
    const { seller, supply, produce } = await farmerOffering(26, 26);
    const { buyer, demand } = await buyerNeeding(10);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, buyer.id, { quantity: 10, unit: "tonne" });
    await acceptTerms(match.id, seller.id);
    expect(await remainingOf(supply.id)).toBe(kg(16));

    await closeEngagement(match.id, seller.id);

    expect(await remainingOf(supply.id)).toBe(kg(26));
    expect((await prisma.intent.findUnique({ where: { id: supply.id } }))!.status).toBe("ACTIVE");
    expect(await stockOf(produce.id)).toBe(26);
    // The record of what was agreed survives the cancellation, including
    // who cancelled and the exact immutable terms that were governing.
    expect(await prisma.agreementTerms.count({ where: { matchId: match.id } })).toBe(1);
    const cancellation = await prisma.agreementCancellation.findUnique({ where: { matchId: match.id } });
    const terms = await prisma.agreementTerms.findFirstOrThrow({ where: { matchId: match.id } });
    expect(cancellation).toMatchObject({ cancelledById: seller.id, termsId: terms.id });
    expect(cancellation!.createdAt).toBeInstanceOf(Date);
  });

  it("records a pre-agreement decline as no cancellation", async () => {
    const { seller, supply } = await farmerOffering(10, 26);
    const { demand } = await buyerNeeding(10);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await closeEngagement(match.id, seller.id);

    expect(await prisma.agreementCancellation.findUnique({ where: { matchId: match.id } })).toBeNull();
  });

  it("never rewrites a completed engagement as declined", async () => {
    const { seller, supply } = await farmerOffering(10, 26);
    const { buyer, demand } = await buyerNeeding(10);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    await proposeTerms(match.id, buyer.id, { quantity: 10, unit: "tonne" });
    await acceptTerms(match.id, seller.id);
    await prisma.match.update({ where: { id: match.id }, data: { status: "COMPLETED" } });

    expect(await closeEngagement(match.id, seller.id)).toEqual({ ok: false, reason: "closed" });
    expect(await statusOf(match.id)).toBe("COMPLETED");
  });

  it("returns the capacity of a trade someone reported never happened", async () => {
    const { seller, supply } = await farmerOffering(26, 26);
    const { buyer, demand } = await buyerNeeding(10);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    await proposeTerms(match.id, buyer.id, { quantity: 10, unit: "tonne" });
    await acceptTerms(match.id, seller.id);
    await prisma.match.update({ where: { id: match.id }, data: { status: "COMPLETED" } });

    await prisma.transactionConfirmation.createMany({
      data: [
        { matchId: match.id, partyId: seller.id, outcome: "DID_NOT_HAPPEN" },
        { matchId: match.id, partyId: buyer.id, outcome: "DID_NOT_HAPPEN" },
      ],
    });

    expect(await remainingOf(supply.id)).toBe(kg(26));
  });

  // ------------------------------------------------------------------
  // J. The P0.2 ownership rule is untouched
  // ------------------------------------------------------------------
  it("never lets a proposal FarmaTrade derived take part in an agreement", async () => {
    const seller = await party();
    const proposed = await createTestIntent(seller.id, {
      side: "SUPPLY",
      status: "PROPOSED",
      quantity: 100,
      unit: "tonne",
    });
    const { buyer, demand } = await buyerNeeding(10);
    const match = await createTestMatch(proposed.id, demand.id, "SUGGESTED");

    const result = await proposeTerms(match.id, buyer.id, { quantity: 10, unit: "tonne" });

    expect(result).toEqual({ ok: false, reason: "not_authorized" });
    expect((await prisma.intent.findUnique({ where: { id: proposed.id } }))!.status).toBe("PROPOSED");
    expect(await prisma.agreementTerms.count({ where: { matchId: match.id } })).toBe(0);
  });

  it("never matches a proposed intent in the first place", async () => {
    const seller = await party();
    const proposed = await createTestIntent(seller.id, {
      side: "SUPPLY",
      status: "PROPOSED",
      quantity: 100,
      unit: "tonne",
    });
    const { demand } = await buyerNeeding(20);
    await generateMatchesForIntent(demand.id);

    // Scoped to this pair on purpose. The demand is a perfectly ordinary
    // Harare produce need and will legitimately match other fixtures'
    // supply; what must never appear is a pairing with the proposal.
    expect(
      await prisma.match.count({ where: { intentAId: proposed.id, intentBId: demand.id } }),
    ).toBe(0);
  });

  // ------------------------------------------------------------------
  // K. Inventory, across the whole lifecycle
  // ------------------------------------------------------------------
  it("leaves inventory alone through proposal, agreement, renegotiation and cancellation", async () => {
    const { seller, supply, produce } = await farmerOffering(20, 26);
    const { buyer, demand } = await buyerNeeding(20);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, buyer.id, { quantity: 8, unit: "tonne" });
    expect(await stockOf(produce.id)).toBe(26);

    await acceptTerms(match.id, seller.id);
    expect(await stockOf(produce.id)).toBe(26);

    await proposeTerms(match.id, seller.id, { quantity: 12, unit: "tonne" });
    await acceptTerms(match.id, buyer.id);
    expect(await stockOf(produce.id)).toBe(26);

    await prisma.match.update({ where: { id: match.id }, data: { status: "COMPLETED" } });
    expect(await stockOf(produce.id)).toBe(26);

    await closeEngagement(match.id, seller.id);
    expect(await stockOf(produce.id)).toBe(26);
  });

  // ------------------------------------------------------------------
  // L. Demand symmetry
  // ------------------------------------------------------------------
  it("leaves 30 of a 100-tonne order outstanding after two suppliers agree 40 and 30", async () => {
    const { buyer, demand } = await buyerNeeding(100);

    for (const qty of [40, 30]) {
      const { seller, supply } = await farmerOffering(qty, qty + 10);
      const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
      await proposeTerms(match.id, seller.id, { quantity: qty, unit: "tonne" });
      const result = await acceptTerms(match.id, buyer.id);
      expect(result).toMatchObject({ ok: true, status: "agreed" });
    }

    expect(await remainingOf(demand.id)).toBe(kg(30));
  });

  // ------------------------------------------------------------------
  // M/N. Unquantified and incomparable engagements still work
  // ------------------------------------------------------------------
  it("lets intents with no quantity agree without inventing one", async () => {
    // Transport, equipment and services carry no quantity at all. They must
    // keep working, and must not become "zero available".
    const seller = await party();
    const buyer = await party();
    const supply = await createTestIntent(seller.id, { side: "SUPPLY", category: "TRANSPORT" });
    const demand = await createTestIntent(buyer.id, { side: "DEMAND", category: "TRANSPORT" });
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, seller.id, { quantity: null, unit: null, price: 120 });
    const result = await acceptTerms(match.id, buyer.id);

    expect(result).toMatchObject({ ok: true, status: "agreed" });
    expect(await remainingOf(supply.id)).toBeNull();
    expect((await prisma.intent.findUnique({ where: { id: supply.id } }))!.status).toBe("ENGAGED");
  });

  it("reserves nothing measurable when the agreed unit does not match the intent's", async () => {
    // No conversion exists and none is guessed. The agreement is real; the
    // reservation is simply not countable against tonnes.
    const { seller, supply } = await farmerOffering(20, 26);
    const { buyer, demand } = await buyerNeeding(30, "bag");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, buyer.id, { quantity: 30, unit: "bag" });
    await acceptTerms(match.id, seller.id);

    expect(await remainingOf(supply.id)).toBe(kg(20));
    const capacity = await loadCapacity(supply.id);
    // Reported, not silently dropped.
    expect(capacity!.unquantified).toBe(1);
  });

  // ------------------------------------------------------------------
  // O. Divergence when an owner authorizes less than they already agreed
  // ------------------------------------------------------------------
  it("exposes the gap when an intent is edited below what is already agreed", async () => {
    const { seller, supply, produce } = await farmerOffering(20, 26);
    const { buyer, demand } = await buyerNeeding(18);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    await proposeTerms(match.id, buyer.id, { quantity: 18, unit: "tonne" });
    await acceptTerms(match.id, seller.id);

    // The farmer now decides they can only spare 15.
    await prisma.intent.update({ where: { id: supply.id }, data: { quantity: 15 } });

    const capacity = await loadCapacity(supply.id);
    expect(capacity!.authorized).toBe(kg(15));
    expect(capacity!.remaining).toBe(0);
    // Three tonnes are promised to somebody who is counting on them, and
    // saying so is the whole point — remaining alone would report nothing
    // available and hide the conflict.
    expect(capacity!.overcommitted).toBe(kg(3));

    // The agreement is not rewritten, and no stock moves.
    const terms = await prisma.agreementTerms.findFirst({ where: { matchId: match.id } });
    expect(terms!.quantity).toBe(18);
    expect(await stockOf(produce.id)).toBe(26);
  });

  // ------------------------------------------------------------------
  // Legacy rows: never fabricate consent
  // ------------------------------------------------------------------
  it("stops a legacy unilateral acceptance from holding anyone's capacity", async () => {
    const { supply } = await farmerOffering(20, 26);
    const { demand } = await buyerNeeding(8);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    // A row exactly as the previous release would have left it.
    await prisma.match.update({
      where: { id: match.id },
      data: { status: "ACCEPTED", quantity: 8, unit: "tonne" },
    });

    expect(await remainingOf(supply.id)).toBe(kg(20));
  });

  it("grandfathers a legacy completed trade, where both parties demonstrably acted", async () => {
    const { seller, supply } = await farmerOffering(20, 26);
    const { buyer, demand } = await buyerNeeding(8);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    await prisma.match.update({
      where: { id: match.id },
      data: { status: "COMPLETED", quantity: 8, unit: "tonne" },
    });
    await prisma.transactionConfirmation.createMany({
      data: [
        { matchId: match.id, partyId: seller.id, outcome: "COMPLETED_GOOD" },
        { matchId: match.id, partyId: buyer.id, outcome: "COMPLETED_GOOD" },
      ],
    });

    expect(await remainingOf(supply.id)).toBe(kg(12));
  });

  // ------------------------------------------------------------------
  // Participation and re-entry
  // ------------------------------------------------------------------
  it("will not let a stranger propose or agree to somebody else's engagement", async () => {
    const { supply } = await farmerOffering(20, 26);
    const { demand } = await buyerNeeding(8);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    const outsider = await party();

    expect(await proposeTerms(match.id, outsider.id, { quantity: 8 })).toEqual({
      ok: false,
      reason: "not_a_participant",
    });
    expect(await acceptTerms(match.id, outsider.id)).toEqual({
      ok: false,
      reason: "not_a_participant",
    });
  });

  it("treats re-proposing the deal already in force as a no-op", async () => {
    // Otherwise a stray double submit would blank the counterparty's
    // consent to terms nobody actually changed.
    const { seller, supply } = await farmerOffering(20, 26);
    const { buyer, demand } = await buyerNeeding(8);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    await proposeTerms(match.id, buyer.id, { quantity: 8, unit: "tonne" });
    await acceptTerms(match.id, seller.id);

    const again = await proposeTerms(match.id, buyer.id, { quantity: 8, unit: "tonne" });

    expect(again).toMatchObject({ ok: true, status: "already_agreed", version: 1 });
    expect(await prisma.agreementTerms.count({ where: { matchId: match.id } })).toBe(1);
    expect(await remainingOf(supply.id)).toBe(kg(12));
  });

  it("does not double-count when a party agrees to the same terms twice", async () => {
    const { seller, supply } = await farmerOffering(20, 26);
    const { buyer, demand } = await buyerNeeding(8);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    await proposeTerms(match.id, buyer.id, { quantity: 8, unit: "tonne" });
    await acceptTerms(match.id, seller.id);

    const again = await acceptTerms(match.id, seller.id);

    expect(again).toMatchObject({ ok: true, status: "already_agreed" });
    expect(await remainingOf(supply.id)).toBe(kg(12));
  });

  it("blocks a commitment that would over-promise one physical source across intents", async () => {
    const { seller, produce, supply: first } = await farmerOffering(20, 26);
    const second = await createTestIntent(seller.id, { side: "SUPPLY", quantity: 20, unit: "tonne" });
    await prisma.intent.update({ where: { id: second.id }, data: { produceId: produce.id } });
    const one = await buyerNeeding(20);
    const two = await buyerNeeding(7);
    const firstMatch = await createTestMatch(first.id, one.demand.id, "SUGGESTED");
    const secondMatch = await createTestMatch(second.id, two.demand.id, "SUGGESTED");

    await proposeTerms(firstMatch.id, one.buyer.id, { quantity: 20, unit: "tonne" });
    await acceptTerms(firstMatch.id, seller.id);
    await proposeTerms(secondMatch.id, two.buyer.id, { quantity: 7, unit: "tonne" });

    expect(await acceptTerms(secondMatch.id, seller.id)).toEqual({ ok: false, reason: "insufficient_capacity" });
    expect(await statusOf(secondMatch.id)).toBe("NEGOTIATING");
    expect(await stockOf(produce.id)).toBe(26);
  });

  it("serializes concurrent commitments across intents sharing one source", async () => {
    const { seller, produce, supply: first } = await farmerOffering(20, 26);
    const second = await createTestIntent(seller.id, { side: "SUPPLY", quantity: 20, unit: "tonne" });
    await prisma.intent.update({ where: { id: second.id }, data: { produceId: produce.id } });
    const one = await buyerNeeding(15);
    const two = await buyerNeeding(15);
    const firstMatch = await createTestMatch(first.id, one.demand.id, "SUGGESTED");
    const secondMatch = await createTestMatch(second.id, two.demand.id, "SUGGESTED");
    await proposeTerms(firstMatch.id, one.buyer.id, { quantity: 15, unit: "tonne" });
    await proposeTerms(secondMatch.id, two.buyer.id, { quantity: 15, unit: "tonne" });

    const results = await Promise.all([
      acceptTerms(firstMatch.id, seller.id),
      acceptTerms(secondMatch.id, seller.id),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.reason === "insufficient_capacity")).toHaveLength(1);
    expect(await stockOf(produce.id)).toBe(26);
  });


  it("waits for the physical source lock before committing", async () => {
    const { seller, produce, supply } = await farmerOffering(10, 10);
    const { buyer, demand } = await buyerNeeding(10);
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    await proposeTerms(match.id, buyer.id, { quantity: 10, unit: "tonne" });

    let release!: () => void;
    let locked!: () => void;
    const releaseSignal = new Promise<void>((resolve) => { release = resolve; });
    const lockedSignal = new Promise<void>((resolve) => { locked = resolve; });
    const blocker = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProduceStock" WHERE id = ${produce.id} FOR UPDATE`;
      locked();
      await releaseSignal;
    });
    await lockedSignal;

    let settled = false;
    const acceptance = acceptTerms(match.id, seller.id).then((result) => { settled = true; return result; });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(settled).toBe(false);

    release();
    await blocker;
    expect(await acceptance).toMatchObject({ ok: true, status: "agreed" });
  });


  it("does not treat reusable equipment as one lifetime-consumable unit", async () => {
    const seller = await party();
    const farm = await prisma.farm.create({ data: { partyId: seller.id, farmName: "Equipment Farm" } });
    const equipment = await prisma.equipment.create({
      data: { farmId: farm.id, name: "Tractor", category: "TRACTOR", available: true },
    });
    const first = await createTestIntent(seller.id, { side: "SUPPLY", quantity: 1, unit: "each" });
    const second = await createTestIntent(seller.id, { side: "SUPPLY", quantity: 1, unit: "each" });
    await prisma.intent.updateMany({
      where: { id: { in: [first.id, second.id] } },
      data: { equipmentId: equipment.id, category: "EQUIPMENT" },
    });
    const one = await buyerNeeding(1, "each");
    const two = await buyerNeeding(1, "each");
    const firstMatch = await createTestMatch(first.id, one.demand.id, "SUGGESTED");
    const secondMatch = await createTestMatch(second.id, two.demand.id, "SUGGESTED");
    await proposeTerms(firstMatch.id, one.buyer.id, { quantity: 1, unit: "each", handoverOn: new Date("2026-09-01") });
    await proposeTerms(secondMatch.id, two.buyer.id, { quantity: 1, unit: "each", handoverOn: new Date("2026-10-01") });

    expect(await acceptTerms(firstMatch.id, seller.id)).toMatchObject({ ok: true, status: "agreed" });
    expect(await acceptTerms(secondMatch.id, seller.id)).toMatchObject({ ok: true, status: "agreed" });
  });

});

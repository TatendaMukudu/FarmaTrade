// Canonical measurement against a real Postgres.
//
// The conversion rules are pure and covered in measurement.test.ts, the
// arithmetic in capacity.test.ts. What this file exists for is the set of
// promises that can only be checked end to end: that an agreement written
// in kilograms is correctly netted off an intent authorized in tonnes, that
// converting units did not open a hole in bilateral consent or in the
// concurrency lock, that bags still refuse to be weighed after a round trip
// through the database, and that none of it moves a single unit of stock.
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { acceptTerms, closeEngagement, proposeTerms } from "@/lib/agreement";
import { loadCapacity } from "@/lib/allocation";
import { ensureDerivedIntent } from "@/lib/derived-intent";
import { createTestParty, createTestIntent, createTestMatch, cleanupParties } from "@/test/factories";

describe("canonical measurement", () => {
  const partyIds: string[] = [];
  afterEach(async () => {
    await cleanupParties(partyIds.splice(0));
  });

  async function party() {
    const { party } = await createTestParty({ roles: ["FARM"] });
    partyIds.push(party.id);
    return party;
  }

  async function farmerOffering(quantity: number | null, unit: string | null, stock = 26) {
    const seller = await party();
    const farm = await prisma.farm.create({ data: { partyId: seller.id, farmName: "Test Farm" } });
    const produce = await prisma.produceStock.create({
      data: { farmId: farm.id, cropType: "Maize", quantity: stock, unit: "TONNE" },
    });
    const supply = await createTestIntent(seller.id, { side: "SUPPLY", quantity, unit });
    await prisma.intent.update({ where: { id: supply.id }, data: { produceId: produce.id } });
    return { seller, produce, supply };
  }

  async function buyerNeeding(quantity: number | null, unit: string | null) {
    const buyer = await party();
    const demand = await createTestIntent(buyer.id, { side: "DEMAND", quantity, unit });
    return { buyer, demand };
  }

  const capacityOf = (intentId: string) => loadCapacity(intentId);
  const remainingOf = async (intentId: string) => (await loadCapacity(intentId))?.remaining;
  const stockOf = async (id: string) =>
    (await prisma.produceStock.findUnique({ where: { id } }))!.quantity;

  // ------------------------------------------------------------------
  // The headline claim. 2 tonnes, agreements of 750 kg and 500 kg.
  // ------------------------------------------------------------------
  it("proves 2 tonnes minus 750 kg minus 500 kg leaves 750 kg, without touching stock", async () => {
    const { seller, supply, produce } = await farmerOffering(2, "tonnes", 26);

    for (const [amount, unit] of [
      [750, "kg"],
      [500, "kg"],
    ] as const) {
      const { buyer, demand } = await buyerNeeding(amount, unit);
      const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
      await proposeTerms(match.id, buyer.id, { quantity: amount, unit });
      const result = await acceptTerms(match.id, seller.id);
      expect(result).toMatchObject({ ok: true, status: "agreed" });
    }

    const capacity = await capacityOf(supply.id);
    expect(capacity!.authorized).toBe(2000);
    expect(capacity!.reserved).toBe(1250);
    expect(capacity!.remaining).toBe(750);
    expect(capacity!.basis?.code).toBe("KILOGRAM");
    // R. Inventory untouched.
    expect(await stockOf(produce.id)).toBe(26);
  });

  // A/B/C. Alias identity and exact conversion, through the database.
  it("treats every spelling of the tonne as the same unit once stored", async () => {
    for (const spelling of ["tonne", "tonnes", "t", "metric tons", "MT"]) {
      const intent = await createTestIntent((await party()).id, {
        side: "SUPPLY",
        quantity: 2,
        unit: spelling,
      });
      const stored = await prisma.intent.findUnique({ where: { id: intent.id } });
      expect(stored!.unitCode, spelling).toBe("METRIC_TONNE");
      // And its authorized figure lands on the same canonical footing.
      expect((await capacityOf(intent.id))!.authorized, spelling).toBe(2000);
    }
  });

  it("keeps the farmer's own spelling for display while reasoning in kilograms", async () => {
    const { supply } = await farmerOffering(2, "metric tonnes");
    const capacity = await capacityOf(supply.id);
    expect(capacity!.displayUnit).toBe("metric tonnes");
    expect(capacity!.basis?.code).toBe("KILOGRAM");
    expect(capacity!.authorized).toBe(2000);
  });

  // D. Mixed-unit capacity.
  it("nets 500 kg and 0.25 tonnes off 2 tonnes and leaves 1.25 tonnes", async () => {
    const { seller, supply } = await farmerOffering(2, "tonnes");

    for (const [amount, unit] of [
      [500, "kg"],
      [0.25, "tonnes"],
    ] as const) {
      const { buyer, demand } = await buyerNeeding(amount, unit);
      const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
      await proposeTerms(match.id, buyer.id, { quantity: amount, unit });
      await acceptTerms(match.id, seller.id);
    }

    expect(await remainingOf(supply.id)).toBe(1250);
  });

  // E. Consent is untouched by conversion.
  it("still reserves nothing until both parties agree, whatever the units", async () => {
    const { supply } = await farmerOffering(2, "tonnes");
    const { buyer, demand } = await buyerNeeding(500, "kg");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, buyer.id, { quantity: 500, unit: "kg" });

    // The buyer alone has spoken. Converting units did not make their word
    // count for two.
    expect(await remainingOf(supply.id)).toBe(2000);
  });

  // F. Concurrency survives conversion.
  it("lets at most one of two concurrent cross-unit agreements take the last tonnes", async () => {
    const { seller, supply } = await farmerOffering(10, "tonnes");

    const matches = [];
    for (const [amount, unit] of [
      [8000, "kg"],
      [8, "tonnes"],
    ] as const) {
      const { buyer, demand } = await buyerNeeding(amount, unit);
      const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
      await proposeTerms(match.id, buyer.id, { quantity: amount, unit });
      matches.push(match);
    }

    // 8000 kg and 8 tonnes are the same eight tonnes written two ways. Both
    // cannot fit inside ten.
    const results = await Promise.all(matches.map((m) => acceptTerms(m.id, seller.id)));

    expect(results.filter((r) => r.ok && r.status === "agreed")).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toMatchObject([{ reason: "insufficient_capacity" }]);
    expect(await remainingOf(supply.id)).toBe(2000);
  });

  // G. Self-exclusion survives conversion.
  it("weighs a cross-unit renegotiation against its own agreement, not on top of it", async () => {
    // 6000 kg agreed against 10 tonnes. Replacing it with 8 tonnes must be
    // checked against the 6000 kg being released.
    const { seller, supply } = await farmerOffering(10, "tonnes");
    const { buyer, demand } = await buyerNeeding(10, "tonnes");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, seller.id, { quantity: 6000, unit: "kg" });
    await acceptTerms(match.id, buyer.id);
    expect(await remainingOf(supply.id)).toBe(4000);

    await proposeTerms(match.id, buyer.id, { quantity: 8, unit: "tonnes" });
    const result = await acceptTerms(match.id, seller.id);

    expect(result).toMatchObject({ ok: true, status: "agreed", version: 2 });
    expect(await remainingOf(supply.id)).toBe(2000);
  });

  // H/Q. Packaging stays contextual through the whole round trip.
  it("refuses to say whether ten bags fit inside two tonnes", async () => {
    // The spec's own case. FarmaTrade does not know what a bag weighs and
    // must not pretend to until somebody tells it.
    const { seller, supply, produce } = await farmerOffering(2, "tonnes");
    const { buyer, demand } = await buyerNeeding(10, "bags");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, buyer.id, { quantity: 10, unit: "bags" });
    const result = await acceptTerms(match.id, seller.id);

    // The agreement is real — two people agreed to it.
    expect(result).toMatchObject({ ok: true, status: "agreed" });
    const capacity = await capacityOf(supply.id);
    // But not a single kilogram was deducted on the strength of a guess.
    expect(capacity!.remaining).toBe(2000);
    expect(capacity!.unmeasured.context_required).toBe(1);
    expect(capacity!.unmeasured.unknown_unit).toBe(0);
    expect(await stockOf(produce.id)).toBe(26);
  });

  it("does count bags against an intent that is itself denominated in bags", async () => {
    const { seller, supply } = await farmerOffering(30, "bags");
    const { buyer, demand } = await buyerNeeding(10, "bags");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, buyer.id, { quantity: 10, unit: "bags" });
    await acceptTerms(match.id, seller.id);

    const capacity = await capacityOf(supply.id);
    expect(capacity!.remaining).toBe(20);
    expect(capacity!.unquantified).toBe(0);
  });

  // I/J/K. The three failure modes stay distinct after a round trip.
  it("distinguishes why each unmeasurable agreement could not be counted", async () => {
    const { seller, supply } = await farmerOffering(2, "tonnes");

    const cases: [number, string][] = [
      [10, "bags"], // context_required
      [500, "litres"], // incompatible_dimension
      [5, "punnets"], // unknown_unit
    ];
    for (const [amount, unit] of cases) {
      const { buyer, demand } = await buyerNeeding(amount, unit);
      const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
      await proposeTerms(match.id, buyer.id, { quantity: amount, unit });
      await acceptTerms(match.id, seller.id);
    }

    const capacity = await capacityOf(supply.id);
    expect(capacity!.unmeasured).toMatchObject({
      context_required: 1,
      incompatible_dimension: 1,
      unknown_unit: 1,
    });
    expect(capacity!.remaining).toBe(2000);
  });

  it("stores no canonical identity for a typo, rather than correcting it", async () => {
    // "tone" is one character from "tonne". A fuzzy matcher would take it
    // and silently claim the farmer offered a thousand times more.
    const intent = await createTestIntent((await party()).id, {
      side: "SUPPLY",
      quantity: 2,
      unit: "tone",
    });
    const stored = await prisma.intent.findUnique({ where: { id: intent.id } });
    expect(stored!.unit).toBe("tone");
    expect(stored!.unitCode).toBeNull();
  });

  // L. ProduceStock reconciliation, through the derivation engine.
  it("carries inventory's enum into a proposal as canonical identity", async () => {
    const seller = await party();
    const farm = await prisma.farm.create({ data: { partyId: seller.id, farmName: "F" } });
    await prisma.produceStock.create({
      data: {
        farmId: farm.id,
        cropType: "Maize",
        quantity: 26,
        unit: "TONNE",
        expectedHarvestDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      },
    });
    await ensureDerivedIntent(farm.id, seller);

    const [proposal] = await prisma.intent.findMany({
      where: { partyId: seller.id, origin: "DERIVED" },
    });
    expect(proposal.unit).toBe("TONNE");
    expect(proposal.unitCode).toBe("METRIC_TONNE");
    // S. And it is still only a proposal.
    expect(proposal.status).toBe("PROPOSED");
  });

  // M. What an old agreement meant is fixed by its stored code.
  it("fixes an agreement's unit identity at proposal time", async () => {
    const { seller, supply } = await farmerOffering(2, "tonnes");
    const { buyer, demand } = await buyerNeeding(500, "kg");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, buyer.id, { quantity: 500, unit: "kg" });
    await acceptTerms(match.id, seller.id);

    const terms = await prisma.agreementTerms.findFirst({ where: { matchId: match.id } });
    expect(terms!.unit).toBe("kg");
    expect(terms!.unitCode).toBe("KILOGRAM");

    // Even if the intent it came from is later re-denominated, the agreed
    // terms still say 500 kg — the code on the terms row is what fixes it.
    await prisma.intent.update({
      where: { id: supply.id },
      data: { unit: "bags", unitCode: "BAG" },
    });
    const unchanged = await prisma.agreementTerms.findFirst({ where: { matchId: match.id } });
    expect(unchanged!.unitCode).toBe("KILOGRAM");
    expect(unchanged!.quantity).toBe(500);
  });

  // N. Precision through the database.
  it("does not manufacture overcommitment out of decimal conversions", async () => {
    const { seller, supply } = await farmerOffering(1, "tonne");

    for (let i = 0; i < 10; i++) {
      const { buyer, demand } = await buyerNeeding(0.1, "tonnes");
      const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
      await proposeTerms(match.id, buyer.id, { quantity: 0.1, unit: "tonnes" });
      const result = await acceptTerms(match.id, seller.id);
      // The tenth agreement fills the intent exactly and must not be
      // refused over floating-point dust.
      expect(result, `agreement ${i + 1}`).toMatchObject({ ok: true, status: "agreed" });
    }

    const capacity = await capacityOf(supply.id);
    expect(capacity!.reserved).toBe(1000);
    expect(capacity!.remaining).toBe(0);
    expect(capacity!.overcommitted).toBe(0);
  });

  // O. Demand symmetry, across units.
  it("leaves 750 kg of a 2-tonne demand after suppliers agree 500 kg and 750 kg", async () => {
    const { buyer, demand } = await buyerNeeding(2, "tonnes");

    for (const amount of [500, 750]) {
      const { seller, supply } = await farmerOffering(amount, "kg", 26);
      const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
      await proposeTerms(match.id, seller.id, { quantity: amount, unit: "kg" });
      await acceptTerms(match.id, buyer.id);
    }

    expect(await remainingOf(demand.id)).toBe(750);
  });

  // P. Null quantity.
  it("leaves transport and equipment intents working exactly as before", async () => {
    const seller = await party();
    const buyer = await party();
    const supply = await createTestIntent(seller.id, { side: "SUPPLY", category: "TRANSPORT" });
    const demand = await createTestIntent(buyer.id, { side: "DEMAND", category: "TRANSPORT" });
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, seller.id, { quantity: null, unit: null, price: 120 });
    const result = await acceptTerms(match.id, buyer.id);

    expect(result).toMatchObject({ ok: true, status: "agreed" });
    const capacity = await capacityOf(supply.id);
    expect(capacity!.remaining).toBeNull();
    expect(capacity!.basis).toBeNull();
  });

  // T. Historical safety.
  it("leaves a legacy agreement in an unresolvable unit alone rather than inventing one", async () => {
    const { seller, supply } = await farmerOffering(20, "tonnes");
    const { buyer, demand } = await buyerNeeding(30, "punnets");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    await proposeTerms(match.id, buyer.id, { quantity: 30, unit: "punnets" });
    await acceptTerms(match.id, seller.id);

    const terms = await prisma.agreementTerms.findFirst({ where: { matchId: match.id } });
    expect(terms!.unit).toBe("punnets");
    // Not backfilled into anything. The words survive; no measurement is
    // fabricated for them.
    expect(terms!.unitCode).toBeNull();
    const capacity = await capacityOf(supply.id);
    expect(capacity!.remaining).toBe(20000);
    expect(capacity!.unmeasured.unknown_unit).toBe(1);
  });

  // R. Inventory, across the whole measurement lifecycle.
  it("moves no stock through conversion, agreement, renegotiation or cancellation", async () => {
    const { seller, supply, produce } = await farmerOffering(2, "tonnes", 26);
    const { buyer, demand } = await buyerNeeding(2000, "kg");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, buyer.id, { quantity: 500, unit: "kg" });
    expect(await stockOf(produce.id)).toBe(26);

    await acceptTerms(match.id, seller.id);
    expect(await stockOf(produce.id)).toBe(26);

    await proposeTerms(match.id, seller.id, { quantity: 1.5, unit: "tonnes" });
    await acceptTerms(match.id, buyer.id);
    expect(await stockOf(produce.id)).toBe(26);
    expect(await remainingOf(supply.id)).toBe(500);

    await closeEngagement(match.id, seller.id);
    expect(await stockOf(produce.id)).toBe(26);
    expect(await remainingOf(supply.id)).toBe(2000);
  });
});

// Commercial pricing against a real Postgres.
//
// The arithmetic is pure and covered in pricing.test.ts. What this file
// exists for is what only real rows can show: that a price's meaning
// survives bilateral consent and renegotiation, that changing an intent's
// asking price tomorrow does not rewrite what two people agreed yesterday,
// that pricing never touches capacity or inventory, and that a legacy
// ambiguous number is still ambiguous after a round trip through the
// database rather than quietly resolved.
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { acceptTerms, proposeTerms, suggestedTerms } from "@/lib/agreement";
import { loadCapacity } from "@/lib/allocation";
import { ensureDerivedIntent } from "@/lib/derived-intent";
import { governingTerms, openTerms, type Participants } from "@/lib/agreement-core";
import { toTermsVersions } from "@/lib/agreement-view";
import { valuationFor } from "@/lib/pricing";
import { currencyByCode, moneyToMajor } from "@/lib/money";
import { createTestParty, createTestIntent, createTestMatch, cleanupParties } from "@/test/factories";

describe("commercial pricing", () => {
  const partyIds: string[] = [];
  afterEach(async () => {
    await cleanupParties(partyIds.splice(0));
  });

  async function party() {
    const { party } = await createTestParty({ roles: ["FARM"] });
    partyIds.push(party.id);
    return party;
  }

  async function farmerOffering(
    quantity: number | null,
    unit: string | null,
    stock = 26,
    sourceUnit: "TONNE" | "BAG" = "TONNE",
  ) {
    const seller = await party();
    const farm = await prisma.farm.create({ data: { partyId: seller.id, farmName: "Test Farm" } });
    const produce = await prisma.produceStock.create({
      data: { farmId: farm.id, cropType: "Maize", quantity: stock, unit: sourceUnit },
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

  // The agreed value of a match, read back the way the app reads it.
  async function agreedValue(matchId: string, participants: Participants) {
    const rows = await prisma.agreementTerms.findMany({
      where: { matchId },
      include: { acceptances: { select: { partyId: true } } },
    });
    const governing = governingTerms(toTermsVersions(rows), participants);
    if (!governing) return null;
    const valuation = valuationFor(
      {
        amount: governing.price,
        currencyCode: governing.priceCurrency,
        basis: governing.priceBasis,
        perUnitCode: governing.priceUnitCode,
      },
      { value: governing.quantity, unitCode: governing.unitCode },
      currencyByCode,
    );
    return valuation.ok
      ? { major: moneyToMajor(valuation.total), currency: valuation.total.currency.code }
      : { unresolved: valuation.reason };
  }

  const stockOf = async (id: string) =>
    (await prisma.produceStock.findUnique({ where: { id } }))!.quantity;

  // ------------------------------------------------------------------
  // M. Consent gates commercial price, exactly as it gates quantity.
  // ------------------------------------------------------------------
  it("has no agreed price until both parties accept the same terms", async () => {
    const { seller, supply } = await farmerOffering(2, "tonnes");
    const { buyer, demand } = await buyerNeeding(2, "tonnes");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    const participants: Participants = [seller.id, buyer.id];

    await proposeTerms(match.id, buyer.id, {
      quantity: 2,
      unit: "tonnes",
      price: 500,
      priceCurrency: "USD",
      priceBasis: "PER_UNIT",
      priceUnit: "tonne",
    });

    // One party has named a price. Nothing is agreed.
    expect(await agreedValue(match.id, participants)).toBeNull();

    await acceptTerms(match.id, seller.id);

    // B, through the database.
    expect(await agreedValue(match.id, participants)).toEqual({ major: 1000, currency: "USD" });
  });

  // C. Cross-unit rate, end to end.
  it("values 750 kg agreed at 500 USD per tonne as 375 USD", async () => {
    const { seller, supply } = await farmerOffering(2, "tonnes");
    const { buyer, demand } = await buyerNeeding(750, "kg");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, buyer.id, {
      quantity: 750,
      unit: "kg",
      price: 500,
      priceCurrency: "USD",
      priceBasis: "PER_UNIT",
      priceUnit: "tonne",
    });
    await acceptTerms(match.id, seller.id);

    expect(await agreedValue(match.id, [seller.id, buyer.id])).toEqual({
      major: 375,
      currency: "USD",
    });
  });

  // E. Package price needs no package mass.
  it("values 10 bags agreed at 20 USD per bag as 200 USD", async () => {
    const { seller, supply } = await farmerOffering(30, "bags", 30, "BAG");
    const { buyer, demand } = await buyerNeeding(10, "bags");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, buyer.id, {
      quantity: 10,
      unit: "bags",
      price: 20,
      priceCurrency: "USD",
      priceBasis: "PER_UNIT",
      priceUnit: "bag",
    });
    await acceptTerms(match.id, seller.id);

    expect(await agreedValue(match.id, [seller.id, buyer.id])).toEqual({
      major: 200,
      currency: "USD",
    });
  });

  // I. A stated total survives an unweighable quantity.
  it("values a stated total for bags whose mass nobody knows", async () => {
    const { seller, supply } = await farmerOffering(30, "bags", 30, "BAG");
    const { buyer, demand } = await buyerNeeding(10, "bags");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, buyer.id, {
      quantity: 10,
      unit: "bags",
      price: 500,
      priceCurrency: "USD",
      priceBasis: "TOTAL",
    });
    await acceptTerms(match.id, seller.id);

    expect(await agreedValue(match.id, [seller.id, buyer.id])).toEqual({
      major: 500,
      currency: "USD",
    });
  });

  // Deferred F: no package context exists on this branch.
  it("refuses to value bags against a per-tonne rate", async () => {
    // A package mass would resolve this. Nothing on the branch supplies one,
    // so it stays unresolved rather than being guessed — the same answer
    // capacity gives for the same reason.
    const seller = await party();
    const supply = await createTestIntent(seller.id, { side: "SUPPLY", quantity: 2, unit: "tonnes" });
    const { buyer, demand } = await buyerNeeding(10, "bags");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, buyer.id, {
      quantity: 10,
      unit: "bags",
      price: 500,
      priceCurrency: "USD",
      priceBasis: "PER_UNIT",
      priceUnit: "tonne",
    });
    await acceptTerms(match.id, seller.id);

    expect(await agreedValue(match.id, [seller.id, buyer.id])).toEqual({
      unresolved: "context_required",
    });
  });

  // ------------------------------------------------------------------
  // N/O. Price is a material term.
  // ------------------------------------------------------------------
  it("keeps the old price governing until both accept the new one", async () => {
    const { seller, supply } = await farmerOffering(2, "tonnes");
    const { buyer, demand } = await buyerNeeding(2, "tonnes");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    const participants: Participants = [seller.id, buyer.id];

    const at = (price: number) =>
      ({
        quantity: 2,
        unit: "tonnes",
        price,
        priceCurrency: "USD",
        priceBasis: "PER_UNIT" as const,
        priceUnit: "tonne",
      });

    await proposeTerms(match.id, seller.id, at(500));
    await acceptTerms(match.id, buyer.id);
    expect(await agreedValue(match.id, participants)).toEqual({ major: 1000, currency: "USD" });

    // The buyer wants 450. Their own consent moves; the farmer's does not
    // follow it.
    const proposed = await proposeTerms(match.id, buyer.id, at(450));
    expect(proposed).toMatchObject({ ok: true, status: "proposed", version: 2 });
    expect(await agreedValue(match.id, participants)).toEqual({ major: 1000, currency: "USD" });

    await acceptTerms(match.id, seller.id);
    expect(await agreedValue(match.id, participants)).toEqual({ major: 900, currency: "USD" });
  });

  it("treats a price change alone as materially new terms", async () => {
    const { seller, supply } = await farmerOffering(2, "tonnes");
    const { buyer, demand } = await buyerNeeding(2, "tonnes");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    const base = {
      quantity: 2,
      unit: "tonnes",
      priceCurrency: "USD",
      priceBasis: "PER_UNIT" as const,
      priceUnit: "tonne",
    };
    await proposeTerms(match.id, seller.id, { ...base, price: 500 });
    await acceptTerms(match.id, buyer.id);

    // Same quantity, same everything else. Only the number moved.
    await proposeTerms(match.id, seller.id, { ...base, price: 480 });
    const versions = await prisma.agreementTerms.findMany({ where: { matchId: match.id } });
    expect(versions).toHaveLength(2);
  });

  it("treats a change of price basis alone as materially new terms", async () => {
    // "500 per tonne" and "500 for the lot" are the same number and a very
    // different deal. Consent to one is not consent to the other.
    const { seller, supply } = await farmerOffering(2, "tonnes");
    const { buyer, demand } = await buyerNeeding(2, "tonnes");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, seller.id, {
      quantity: 2,
      unit: "tonnes",
      price: 500,
      priceCurrency: "USD",
      priceBasis: "PER_UNIT",
      priceUnit: "tonne",
    });
    await acceptTerms(match.id, buyer.id);

    await proposeTerms(match.id, seller.id, {
      quantity: 2,
      unit: "tonnes",
      price: 500,
      priceCurrency: "USD",
      priceBasis: "TOTAL",
    });

    const rows = await prisma.agreementTerms.findMany({
      where: { matchId: match.id },
      include: { acceptances: true },
      orderBy: { version: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[1].acceptances).toHaveLength(1);
    // The per-tonne deal still governs, at 1000 rather than 500.
    expect(await agreedValue(match.id, [seller.id, buyer.id])).toEqual({
      major: 1000,
      currency: "USD",
    });
  });

  // ------------------------------------------------------------------
  // P/Q. Yesterday's agreement is not rewritten by today's edit.
  // ------------------------------------------------------------------
  it("does not let an intent's later price edit change what was agreed", async () => {
    const { seller, supply } = await farmerOffering(2, "tonnes");
    const { buyer, demand } = await buyerNeeding(2, "tonnes");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, seller.id, {
      quantity: 2,
      unit: "tonnes",
      price: 500,
      priceCurrency: "USD",
      priceBasis: "PER_UNIT",
      priceUnit: "tonne",
    });
    await acceptTerms(match.id, buyer.id);

    // The farmer raises their asking price, and re-denominates it.
    await prisma.intent.update({
      where: { id: supply.id },
      data: { askingPrice: 900, priceBasis: "TOTAL", priceCurrency: "ZAR", priceUnitCode: null },
    });

    // What the two parties agreed is untouched — amount, currency, basis and
    // basis unit all still say what they said.
    const terms = await prisma.agreementTerms.findFirst({ where: { matchId: match.id } });
    expect(Number(terms!.price)).toBe(500);
    expect(terms!.priceCurrency).toBe("USD");
    expect(terms!.priceBasis).toBe("PER_UNIT");
    expect(terms!.priceUnitCode).toBe("METRIC_TONNE");
    expect(await agreedValue(match.id, [seller.id, buyer.id])).toEqual({
      major: 1000,
      currency: "USD",
    });
  });

  // ------------------------------------------------------------------
  // R. Legacy ambiguity survives a round trip.
  // ------------------------------------------------------------------
  it("does not invent a meaning for a legacy price", async () => {
    const seller = await party();
    const intent = await createTestIntent(seller.id, {
      side: "SUPPLY",
      quantity: 10,
      unit: "tonnes",
    });
    // Exactly as the previous release would have left it: an amount and
    // nothing else.
    await prisma.intent.update({ where: { id: intent.id }, data: { askingPrice: 2700 } });

    const stored = await prisma.intent.findUnique({ where: { id: intent.id } });
    expect(Number(stored!.askingPrice)).toBe(2700);
    expect(stored!.priceBasis).toBeNull();
    expect(stored!.priceCurrency).toBeNull();
  });

  it("carries no ambiguous asking price onto proposed terms", async () => {
    // Otherwise the ambiguity would launder itself into an agreement two
    // parties are about to accept.
    // suggestedTerms is what the accept path calls to open a negotiation.
    const suggestion = suggestedTerms(
      {
        remaining: 2000,
        basis: null,
        askingPrice: 2700,
        priceCurrency: null,
        priceBasis: null,
        priceUnitCode: null,
      },
      {
        remaining: 2000,
        basis: null,
        askingPrice: null,
        priceCurrency: null,
        priceBasis: null,
        priceUnitCode: null,
      },
    );
    expect(suggestion.price).toBeNull();
    expect(suggestion.priceBasis).toBeNull();
  });

  // ------------------------------------------------------------------
  // Z. Capacity is independent of price.
  // ------------------------------------------------------------------
  it("reserves the same quantity whether the price is known, unknown or absent", async () => {
    for (const price of [
      { price: 500, priceCurrency: "USD", priceBasis: "PER_UNIT" as const, priceUnit: "tonne" },
      { price: 500, priceCurrency: "USD", priceBasis: "TOTAL" as const },
      { price: null },
    ]) {
      const { seller, supply } = await farmerOffering(2, "tonnes");
      const { buyer, demand } = await buyerNeeding(0.5, "tonnes");
      const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

      await proposeTerms(match.id, buyer.id, { quantity: 500, unit: "kg", ...price });
      await acceptTerms(match.id, seller.id);

      const capacity = await loadCapacity(supply.id);
      expect(capacity!.remaining, JSON.stringify(price)).toBe(1500);
    }
  });

  // ------------------------------------------------------------------
  // AB. Inventory is untouched by everything priced.
  // ------------------------------------------------------------------
  it("moves no stock through pricing, agreement or renegotiation", async () => {
    const { seller, supply, produce } = await farmerOffering(2, "tonnes", 26);
    const { buyer, demand } = await buyerNeeding(2, "tonnes");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    const at = (price: number) => ({
      quantity: 1,
      unit: "tonnes",
      price,
      priceCurrency: "USD",
      priceBasis: "PER_UNIT" as const,
      priceUnit: "tonne",
    });

    await proposeTerms(match.id, buyer.id, at(500));
    expect(await stockOf(produce.id)).toBe(26);
    await acceptTerms(match.id, seller.id);
    expect(await stockOf(produce.id)).toBe(26);
    await proposeTerms(match.id, seller.id, at(450));
    await acceptTerms(match.id, buyer.id);
    expect(await stockOf(produce.id)).toBe(26);
  });

  // ------------------------------------------------------------------
  // AC. No price is invented for a derived intent.
  // ------------------------------------------------------------------
  it("invents no price when deriving an intent from farm records", async () => {
    // FarmaTrade knows a farmer has 26 tonnes coming. It has no idea what
    // they want for it, and a proposal that quietly named a figure would be
    // putting a number in their mouth.
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
    expect(proposal.askingPrice).toBeNull();
    expect(proposal.priceBasis).toBeNull();
    expect(proposal.priceCurrency).toBeNull();
  });

  // ------------------------------------------------------------------
  // AD/AE. Price-optional and non-produce workflows keep working.
  // ------------------------------------------------------------------
  it("keeps price-free agreements working exactly as before", async () => {
    const { seller, supply } = await farmerOffering(2, "tonnes");
    const { buyer, demand } = await buyerNeeding(1, "tonnes");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, buyer.id, { quantity: 1, unit: "tonnes" });
    const result = await acceptTerms(match.id, seller.id);

    expect(result).toMatchObject({ ok: true, status: "agreed" });
    expect(await agreedValue(match.id, [seller.id, buyer.id])).toEqual({ unresolved: "no_price" });
    expect((await loadCapacity(supply.id))!.remaining).toBe(1000);
  });

  it("prices a transport engagement that has no quantity at all", async () => {
    // A haulage job is a total, not a rate per anything, and it has no
    // tonnage of its own. Produce-shaped price assumptions must not break it.
    const seller = await party();
    const buyer = await party();
    const supply = await createTestIntent(seller.id, { side: "SUPPLY", category: "TRANSPORT" });
    const demand = await createTestIntent(buyer.id, { side: "DEMAND", category: "TRANSPORT" });
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, seller.id, {
      quantity: null,
      unit: null,
      price: 120,
      priceCurrency: "USD",
      priceBasis: "TOTAL",
    });
    await acceptTerms(match.id, buyer.id);

    expect(await agreedValue(match.id, [seller.id, buyer.id])).toEqual({
      major: 120,
      currency: "USD",
    });
    expect((await loadCapacity(supply.id))!.remaining).toBeNull();
  });

  // ------------------------------------------------------------------
  // L/X. Currencies stay separate.
  // ------------------------------------------------------------------
  it("records the currency the parties named, not the one their country implies", async () => {
    // Both parties here are in Zimbabwe, whose region record says USD. They
    // agreed in rand, and that is what the row must say — currency used to
    // be inferred from the reader's country and would have said USD.
    const { seller, supply } = await farmerOffering(2, "tonnes");
    const { buyer, demand } = await buyerNeeding(2, "tonnes");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, buyer.id, {
      quantity: 2,
      unit: "tonnes",
      price: 9000,
      priceCurrency: "ZAR",
      priceBasis: "TOTAL",
    });
    await acceptTerms(match.id, seller.id);

    expect(await agreedValue(match.id, [seller.id, buyer.id])).toEqual({
      major: 9000,
      currency: "ZAR",
    });
  });

  // ------------------------------------------------------------------
  // AA. Concurrency protections still hold with priced terms.
  // ------------------------------------------------------------------
  it("still refuses to oversubscribe when the terms carry prices", async () => {
    const { seller, supply } = await farmerOffering(10, "tonnes");

    const matches = [];
    for (let i = 0; i < 2; i++) {
      const { buyer, demand } = await buyerNeeding(8, "tonnes");
      const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
      await proposeTerms(match.id, buyer.id, {
        quantity: 8,
        unit: "tonnes",
        price: 500,
        priceCurrency: "USD",
        priceBasis: "PER_UNIT",
        priceUnit: "tonne",
      });
      matches.push(match);
    }

    const results = await Promise.all(matches.map((m) => acceptTerms(m.id, seller.id)));

    expect(results.filter((r) => r.ok && r.status === "agreed")).toHaveLength(1);
    expect((await loadCapacity(supply.id))!.remaining).toBe(2000);
  });

  // ------------------------------------------------------------------
  // The open terms a farmer is being asked to agree to carry their meaning.
  // ------------------------------------------------------------------
  it("shows an unanswered proposal with its price meaning intact", async () => {
    const { seller, supply } = await farmerOffering(2, "tonnes");
    const { buyer, demand } = await buyerNeeding(2, "tonnes");
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    await proposeTerms(match.id, buyer.id, {
      quantity: 2,
      unit: "tonnes",
      price: 450,
      priceCurrency: "USD",
      priceBasis: "PER_UNIT",
      priceUnit: "tonne",
    });

    const rows = await prisma.agreementTerms.findMany({
      where: { matchId: match.id },
      include: { acceptances: { select: { partyId: true } } },
    });
    const open = openTerms(toTermsVersions(rows), [seller.id, buyer.id]);
    expect(open).toMatchObject({
      price: 450,
      priceCurrency: "USD",
      priceBasis: "PER_UNIT",
      priceUnitCode: "METRIC_TONNE",
    });
  });
});

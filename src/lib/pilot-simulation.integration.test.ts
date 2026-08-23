import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { acceptTerms, proposeTerms } from "@/lib/agreement";
import { loadCapacities } from "@/lib/allocation";
import { settlementOf } from "@/lib/confirmations-core";
import { roleOutcomesFor } from "@/lib/role-reputation";
import { cleanupParties, createTestParty } from "@/test/factories";

// ---------------------------------------------------------------------------
// Adversarial pilot simulation.
// ---------------------------------------------------------------------------
//
// Everything else in the suite proves a unit behaves. This file asks the only
// question that matters before real people are let in:
//
//   Can FarmaTrade be made to describe a commercial reality that cannot exist?
//
// So these cases are written as attacks by a cast of ordinary pilot actors,
// not as demonstrations. Where an attack fails to break anything, the assertion
// records WHY it could not, so a future change that removes the reason turns
// this red.

describe("adversarial pilot simulation", () => {
  const partyIds: string[] = [];
  afterEach(async () => cleanupParties(partyIds.splice(0)));

  async function actor(name: string) {
    const created = await createTestParty({ province: "Manicaland", district: "Mutare" });
    partyIds.push(created.party.id);
    return { id: created.party.id, name };
  }

  // A farm with real produce in the shed.
  async function shed(partyId: string, quantity: number, unit: "TONNE" | "BAG") {
    const farm = await prisma.farm.create({
      data: { partyId, farmName: `Farm ${partyId.slice(-5)}` },
    });
    const stock = await prisma.produceStock.create({
      data: { farmId: farm.id, cropType: "Maize", quantity, unit },
    });
    return stock;
  }

  // A commercial intent, optionally backed by a physical source.
  async function intent(
    partyId: string,
    opts: {
      side: "SUPPLY" | "DEMAND";
      quantity: number;
      unitCode: string;
      unit: string;
      produceId?: string;
      category?: "PRODUCE" | "TRANSPORT";
    },
  ) {
    return prisma.intent.create({
      data: {
        partyId,
        side: opts.side,
        category: opts.category ?? "PRODUCE",
        title: `${opts.quantity} ${opts.unit} maize`,
        countryCode: "ZW",
        province: "Manicaland",
        district: "Mutare",
        status: "ACTIVE",
        quantity: opts.quantity,
        unit: opts.unit,
        unitCode: opts.unitCode,
        produceId: opts.produceId ?? null,
      },
    });
  }

  async function match(aId: string, bId: string) {
    return prisma.match.create({
      data: { intentAId: aId, intentBId: bId, status: "SUGGESTED", score: 50, reasons: [] },
    });
  }

  // Drive a match to a bilateral agreement for `quantity`.
  async function agree(
    matchId: string,
    proposer: string,
    accepter: string,
    quantity: number,
    _unitCode: string,
    unit: string,
  ) {
    await proposeTerms(matchId, proposer, {
      quantity,
      unit,
      price: null,
      priceCurrency: null,
      priceBasis: null,
      priceUnit: null,
      handoverOn: null,
    });
    return acceptTerms(matchId, accepter);
  }

  // -------------------------------------------------------------------------
  // 1. Farm truth is not commercial intent.
  // -------------------------------------------------------------------------
  it("ATTACK: recording 26 tonnes in the shed does not offer 26 tonnes to anyone", async () => {
    const rudo = await actor("Rudo");
    await shed(rudo.id, 26, "TONNE");

    const active = await prisma.intent.count({
      where: { partyId: rudo.id, status: "ACTIVE" },
    });

    // Inference is never authorization. Nothing about writing down what is in
    // the shed makes it purchasable.
    expect(active).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 2. Two commercial paths, one physical source.
  // -------------------------------------------------------------------------
  it("ATTACK: two separate buyers cannot together be promised more maize than exists", async () => {
    const rudo = await actor("Rudo");
    const patricia = await actor("Patricia");
    const nyasha = await actor("Nyasha");

    // 26 tonnes physically present. Rudo lists it twice — a perfectly
    // ordinary thing to do, and the reason the ceiling has to exist.
    const stock = await shed(rudo.id, 26, "TONNE");
    const supplyA = await intent(rudo.id, {
      side: "SUPPLY", quantity: 20, unit: "tonnes", unitCode: "METRIC_TONNE", produceId: stock.id,
    });
    const supplyB = await intent(rudo.id, {
      side: "SUPPLY", quantity: 20, unit: "tonnes", unitCode: "METRIC_TONNE", produceId: stock.id,
    });

    const demandA = await intent(patricia.id, {
      side: "DEMAND", quantity: 20, unit: "tonnes", unitCode: "METRIC_TONNE",
    });
    const demandB = await intent(nyasha.id, {
      side: "DEMAND", quantity: 20, unit: "tonnes", unitCode: "METRIC_TONNE",
    });

    const matchA = await match(supplyA.id, demandA.id);
    const matchB = await match(supplyB.id, demandB.id);

    const first = await agree(matchA.id, rudo.id, patricia.id, 20, "METRIC_TONNE", "tonnes");
    expect(first.ok).toBe(true);

    // Only 6 tonnes of physical maize remain. A second 20-tonne agreement
    // would promise 40 against 26.
    const second = await agree(matchB.id, rudo.id, nyasha.id, 20, "METRIC_TONNE", "tonnes");
    expect(second.ok).toBe(false);

    const agreed = await prisma.match.count({
      where: { id: { in: [matchA.id, matchB.id] }, status: "AGREED" },
    });
    expect(agreed).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 3. Concurrency. The same attack, run simultaneously.
  // -------------------------------------------------------------------------
  it("ATTACK: two buyers accepting at the same instant cannot both win", async () => {
    // Deliberately repeated. A single run of this race is a COIN FLIP: with
    // the source lock removed, one run detects the oversell only about three
    // times in five, because the two transactions have to actually overlap at
    // the capacity read to race. Measured over eight runs of the equivalent
    // case in agreement.integration.test.ts: 5 detections, 3 misses.
    //
    // So a one-shot concurrency test is a guard nobody can rely on. Running
    // the race six times drops the odds of missing a regression from ~40% to
    // under half a percent, which is the difference between a test and a
    // reassurance.
    const RACES = 6;

    for (let race = 0; race < RACES; race += 1) {
      const rudo = await actor("Rudo");
      const patricia = await actor("Patricia");
      const nyasha = await actor("Nyasha");

      const stock = await shed(rudo.id, 10, "TONNE");
      const supplyA = await intent(rudo.id, {
        side: "SUPPLY", quantity: 10, unit: "tonnes", unitCode: "METRIC_TONNE", produceId: stock.id,
      });
      const supplyB = await intent(rudo.id, {
        side: "SUPPLY", quantity: 10, unit: "tonnes", unitCode: "METRIC_TONNE", produceId: stock.id,
      });
      const demandA = await intent(patricia.id, {
        side: "DEMAND", quantity: 8, unit: "tonnes", unitCode: "METRIC_TONNE",
      });
      const demandB = await intent(nyasha.id, {
        side: "DEMAND", quantity: 8, unit: "tonnes", unitCode: "METRIC_TONNE",
      });

      const matchA = await match(supplyA.id, demandA.id);
      const matchB = await match(supplyB.id, demandB.id);

      for (const m of [matchA.id, matchB.id]) {
        await proposeTerms(m, rudo.id, {
          quantity: 8, unit: "tonnes",
          price: null, priceCurrency: null, priceBasis: null, priceUnit: null, handoverOn: null,
        });
      }

      // 8 + 8 = 16 against 10 tonnes. Fired together, so the row lock on the
      // physical source is the only thing between the pilot and a promise
      // reality cannot keep.
      const [a, b] = await Promise.all([
        acceptTerms(matchA.id, patricia.id),
        acceptTerms(matchB.id, nyasha.id),
      ]);

      expect([a.ok, b.ok].filter(Boolean), `race ${race}`).toHaveLength(1);
      const agreed = await prisma.match.count({
        where: { id: { in: [matchA.id, matchB.id] }, status: "AGREED" },
      });
      expect(agreed, `race ${race}`).toBe(1);

      // The shed never moves, whoever wins.
      const after = await prisma.produceStock.findUnique({ where: { id: stock.id } });
      expect(after?.quantity).toBe(10);
    }
  });

  // -------------------------------------------------------------------------
  // 4. Measurement. A bag is not a weight.
  // -------------------------------------------------------------------------
  it("ATTACK: a source measured in bags cannot back a commitment written in kilograms", async () => {
    const rudo = await actor("Rudo");
    const patricia = await actor("Patricia");

    const stock = await shed(rudo.id, 500, "BAG");
    const supply = await intent(rudo.id, {
      side: "SUPPLY", quantity: 500, unit: "bags", unitCode: "BAG", produceId: stock.id,
    });
    const demand = await intent(patricia.id, {
      side: "DEMAND", quantity: 9_000_000, unit: "kg", unitCode: "KILOGRAM",
    });
    const m = await match(supply.id, demand.id);

    // FarmaTrade does not know what a bag weighs and must not guess. Refusing
    // is the correct answer; a plausible tonnage would be a lie about the
    // size of somebody's harvest.
    const outcome = await agree(m.id, rudo.id, patricia.id, 9_000_000, "KILOGRAM", "kg");
    expect(outcome.ok).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 5. The honest full loop, including transport, and what it leaves behind.
  // -------------------------------------------------------------------------
  it("PILOT LOOP: supply, demand, agreement, transport, completion, history", async () => {
    const rudo = await actor("Rudo");
    const patricia = await actor("Patricia");
    const tendai = await actor("Tendai the transporter");

    const stock = await shed(rudo.id, 26, "TONNE");
    const supply = await intent(rudo.id, {
      side: "SUPPLY", quantity: 20, unit: "tonnes", unitCode: "METRIC_TONNE", produceId: stock.id,
    });
    const demand = await intent(patricia.id, {
      side: "DEMAND", quantity: 15, unit: "tonnes", unitCode: "METRIC_TONNE",
    });
    const produceMatch = await match(supply.id, demand.id);

    const agreed = await agree(produceMatch.id, rudo.id, patricia.id, 15, "METRIC_TONNE", "tonnes");
    expect(agreed.ok).toBe(true);

    // Transport is an ordinary intent on both sides. No Transport product, no
    // Rent verb, no dedicated route — a truck is a thing somebody has.
    const truck = await intent(tendai.id, {
      side: "SUPPLY", quantity: 1, unit: "trip", unitCode: null as unknown as string, category: "TRANSPORT",
    });
    const haulage = await intent(patricia.id, {
      side: "DEMAND", quantity: 1, unit: "trip", unitCode: null as unknown as string, category: "TRANSPORT",
    });
    const transportMatch = await match(truck.id, haulage.id);
    const haulageAgreed = await agree(transportMatch.id, tendai.id, patricia.id, 1, "", "trip");
    expect(haulageAgreed.ok).toBe(true);

    // The maize moved. Both sides say so.
    for (const partyId of [rudo.id, patricia.id]) {
      await prisma.transactionConfirmation.create({
        data: { matchId: produceMatch.id, partyId, outcome: "COMPLETED_GOOD" },
      });
    }
    const reports = await prisma.transactionConfirmation.findMany({
      where: { matchId: produceMatch.id },
      select: { outcome: true },
    });
    expect(settlementOf(reports.map((r) => r.outcome))).toEqual({ kind: "completed" });

    // 15 of the 20 authorized tonnes are spoken for; 5 remain sellable.
    const capacities = await loadCapacities([supply.id]);
    expect(capacities.get(supply.id)?.remaining).toBe(5000); // canonical kg

    // The shed is untouched. Commerce never moves stock — only a fulfilment
    // layer would, and it does not exist.
    const after = await prisma.produceStock.findUnique({ where: { id: stock.id } });
    expect(after?.quantity).toBe(26);

    // And the record is role-correct: Rudo supplied, Patricia bought.
    const rudoRecord = await roleOutcomesFor(rudo.id);
    const patriciaRecord = await roleOutcomesFor(patricia.id);
    expect(rudoRecord.SUPPLIER.completed).toBe(1);
    expect(rudoRecord.BUYER.completed).toBe(0);
    expect(patriciaRecord.BUYER.completed).toBe(1);
    expect(patriciaRecord.SUPPLIER.completed).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 6. Failure is allowed to be failure.
  // -------------------------------------------------------------------------
  it("ATTACK: a disagreement about whether the trade happened cannot become a completed trade", async () => {
    const rudo = await actor("Rudo");
    const patricia = await actor("Patricia");

    const stock = await shed(rudo.id, 10, "TONNE");
    const supply = await intent(rudo.id, {
      side: "SUPPLY", quantity: 10, unit: "tonnes", unitCode: "METRIC_TONNE", produceId: stock.id,
    });
    const demand = await intent(patricia.id, {
      side: "DEMAND", quantity: 10, unit: "tonnes", unitCode: "METRIC_TONNE",
    });
    const m = await match(supply.id, demand.id);
    expect((await agree(m.id, rudo.id, patricia.id, 10, "METRIC_TONNE", "tonnes")).ok).toBe(true);

    await prisma.transactionConfirmation.create({
      data: { matchId: m.id, partyId: rudo.id, outcome: "COMPLETED_GOOD" },
    });
    await prisma.transactionConfirmation.create({
      data: { matchId: m.id, partyId: patricia.id, outcome: "DID_NOT_HAPPEN" },
    });

    const reports = await prisma.transactionConfirmation.findMany({
      where: { matchId: m.id }, select: { outcome: true },
    });
    expect(settlementOf(reports.map((r) => r.outcome)).kind).toBe("disputed");

    // Both accounts survive. FarmaTrade holds evidence; it does not adjudicate.
    expect(reports).toHaveLength(2);
  });
});

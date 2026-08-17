// Integration test for the derivation engine against a real Postgres.
//
// The pure decision logic is covered in derivation-core.test.ts. What this
// file exists for is the set of promises that can only be checked against
// real rows: that a proposal never becomes active on its own, that inventory
// is never touched, and that a decline actually survives the next run.
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ensureDerivedIntent } from "@/lib/derived-intent";
import { createTestParty, cleanupParties } from "@/test/factories";

const DAY = 24 * 60 * 60 * 1000;

describe("ensureDerivedIntent", () => {
  const partyIds: string[] = [];
  afterEach(async () => {
    await cleanupParties(partyIds.splice(0));
  });

  async function farmWithHarvest(opts: { quantity?: number; daysAway?: number } = {}) {
    const { party } = await createTestParty({ roles: ["FARM"] });
    partyIds.push(party.id);
    const farm = await prisma.farm.create({
      data: { partyId: party.id, farmName: "Test Farm" },
    });
    const produce = await prisma.produceStock.create({
      data: {
        farmId: farm.id,
        cropType: "Maize",
        quantity: opts.quantity ?? 26,
        unit: "TONNE",
        expectedHarvestDate: new Date(Date.now() + (opts.daysAway ?? 3) * DAY),
        perishable: false,
      },
    });
    return { party, farm, produce };
  }

  const derivedFor = (partyId: string) =>
    prisma.intent.findMany({ where: { partyId, origin: "DERIVED" } });

  it("proposes from an approaching harvest, and proposes only", () => {
    return (async () => {
      const { party, farm } = await farmWithHarvest();
      await ensureDerivedIntent(farm.id, party);

      const [intent] = await derivedFor(party.id);
      expect(intent).toBeDefined();
      expect(intent.status).toBe("PROPOSED");
      expect(intent.origin).toBe("DERIVED");
      expect(intent.derivationKey).toBeTruthy();
    })();
  });

  it("never activates anything by itself, however many times it runs", async () => {
    const { party, farm } = await farmWithHarvest();
    for (let i = 0; i < 3; i++) await ensureDerivedIntent(farm.id, party);

    const derived = await derivedFor(party.id);
    expect(derived).toHaveLength(1);
    expect(derived.every((i) => i.status === "PROPOSED")).toBe(true);
  });

  it("creates one proposal when two page renders derive the same harvest concurrently", async () => {
    const { party, farm } = await farmWithHarvest();

    const runs = await Promise.all([
      ensureDerivedIntent(farm.id, party),
      ensureDerivedIntent(farm.id, party),
    ]);

    expect(await derivedFor(party.id)).toHaveLength(1);
    expect(runs.reduce((count, run) => count + run.created, 0)).toBe(1);
  });

  it("does not decrement inventory just because an intent exists", async () => {
    // The farm still holds 26 tonnes. A proposal is a reading of state, not
    // a claim on it.
    const { party, farm, produce } = await farmWithHarvest({ quantity: 26 });
    await ensureDerivedIntent(farm.id, party);

    const after = await prisma.produceStock.findUnique({ where: { id: produce.id } });
    expect(after!.quantity).toBe(26);
  });

  it("revises an untouched proposal when the harvest estimate changes", async () => {
    const { party, farm, produce } = await farmWithHarvest({ quantity: 26 });
    await ensureDerivedIntent(farm.id, party);
    const before = (await derivedFor(party.id))[0];

    await prisma.produceStock.update({ where: { id: produce.id }, data: { quantity: 15 } });
    await ensureDerivedIntent(farm.id, party);

    const after = await derivedFor(party.id);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before.id);
    expect(after[0].quantity).toBe(15);
  });

  it("will not rewrite a commitment the farmer has activated", async () => {
    const { party, farm, produce } = await farmWithHarvest({ quantity: 26 });
    await ensureDerivedIntent(farm.id, party);
    const proposal = (await derivedFor(party.id))[0];

    // The farmer makes it available on the terms they saw.
    await prisma.intent.update({ where: { id: proposal.id }, data: { status: "ACTIVE" } });

    // Then the harvest estimate collapses.
    await prisma.produceStock.update({ where: { id: produce.id }, data: { quantity: 15 } });
    const run = await ensureDerivedIntent(farm.id, party);

    const after = await prisma.intent.findUnique({ where: { id: proposal.id } });
    expect(after!.quantity).toBe(26);
    expect(after!.status).toBe("ACTIVE");
    // Reported, not applied.
    expect(run.diverged).toHaveLength(1);
    expect(run.diverged[0].intentId).toBe(proposal.id);
  });

  it("stops asking once the farmer said not selling this", async () => {
    const { party, farm } = await farmWithHarvest();
    await ensureDerivedIntent(farm.id, party);
    const proposal = (await derivedFor(party.id))[0];

    await prisma.intent.update({ where: { id: proposal.id }, data: { status: "WITHDRAWN" } });

    for (let i = 0; i < 3; i++) await ensureDerivedIntent(farm.id, party);
    const derived = await derivedFor(party.id);
    expect(derived).toHaveLength(1);
    expect(derived[0].status).toBe("WITHDRAWN");
  });

  it("asks once more if the harvest turns out materially different", async () => {
    const { party, farm, produce } = await farmWithHarvest({ quantity: 26 });
    await ensureDerivedIntent(farm.id, party);
    const proposal = (await derivedFor(party.id))[0];
    await prisma.intent.update({ where: { id: proposal.id }, data: { status: "WITHDRAWN" } });

    await prisma.produceStock.update({ where: { id: produce.id }, data: { quantity: 60 } });
    await ensureDerivedIntent(farm.id, party);

    const derived = await derivedFor(party.id);
    expect(derived).toHaveLength(2);
    expect(derived.filter((i) => i.status === "PROPOSED")).toHaveLength(1);
  });

  it("stays quiet about a harvest that is still months away", async () => {
    const { party, farm } = await farmWithHarvest({ daysAway: 120 });
    await ensureDerivedIntent(farm.id, party);
    expect(await derivedFor(party.id)).toHaveLength(0);
  });

  it("carries the farmer's own crop name into the proposal", async () => {
    const { party } = await createTestParty({ roles: ["FARM"] });
    partyIds.push(party.id);
    const farm = await prisma.farm.create({ data: { partyId: party.id, farmName: "F" } });
    await prisma.produceStock.create({
      data: {
        farmId: farm.id,
        cropType: "Mhunga",
        quantity: 8,
        unit: "TONNE",
        expectedHarvestDate: new Date(Date.now() + 2 * DAY),
      },
    });
    await ensureDerivedIntent(farm.id, party);

    const [intent] = await derivedFor(party.id);
    expect(intent.title).toContain("Mhunga");
  });
});

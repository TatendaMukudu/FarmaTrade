import "server-only";
import { prisma } from "@/lib/prisma";
import { formatQuantity } from "@/lib/units";
import {
  HARVEST_WINDOW_DAYS,
  decide,
  type ExistingDerived,
  type SourceState,
} from "@/lib/derivation-core";

// The derivation engine: farm state in, proposals out.
//
// It creates and revises DERIVED + PROPOSED intents and does nothing else.
// It never activates one, never deletes one, and never touches an intent
// whose owner has taken control of it. Those are not incidental omissions —
// they are the boundary the product rests on. See derivation-core.ts for the
// ownership rule.
//
// It also never touches inventory. A proposal is a reading of state, not a
// claim on it: proposing 26 tonnes leaves 26 tonnes recorded, and only
// fulfilment ever moves that number.

// Everything already derived from a farm's produce, grouped by source row.
async function existingBySource(partyId: string): Promise<Map<string, ExistingDerived[]>> {
  const rows = await prisma.intent.findMany({
    where: { partyId, origin: "DERIVED", produceId: { not: null } },
    select: {
      id: true,
      origin: true,
      status: true,
      derivationKey: true,
      quantity: true,
      productId: true,
      produceId: true,
    },
  });
  const bySource = new Map<string, ExistingDerived[]>();
  for (const row of rows) {
    const list = bySource.get(row.produceId!) ?? [];
    list.push({
      id: row.id,
      origin: row.origin,
      status: row.status,
      derivationKey: row.derivationKey,
      quantity: row.quantity,
      productId: row.productId,
    });
    bySource.set(row.produceId!, list);
  }
  return bySource;
}

export type DerivationRun = {
  created: number;
  revised: number;
  diverged: { intentId: string; basis: string }[];
};

// Reads a farm's produce and brings its proposals up to date.
//
// Idempotent: running it twice changes nothing the second time, because
// every decision is derived from the current state rather than from a record
// of what was done last. Safe to call on every page load, which is what
// makes proposals feel like they were simply there.
export async function ensureDerivedIntent(
  farmId: string,
  party: { id: string; province: string; district: string; countryCode: string },
  now = new Date(),
): Promise<DerivationRun> {
  const run: DerivationRun = { created: 0, revised: 0, diverged: [] };

  // Not filtered by harvest window here: an existing proposal may need
  // revising or a divergence flagging even once its date has passed, and a
  // decline must keep suppressing regardless. `decide` applies the window
  // only where it belongs, to creating something new.
  const produce = await prisma.produceStock.findMany({
    where: { farmId, quantity: { gt: 0 }, expectedHarvestDate: { not: null } },
    select: {
      id: true,
      cropType: true,
      productId: true,
      quantity: true,
      unit: true,
      expectedHarvestDate: true,
      perishable: true,
    },
  });
  if (produce.length === 0) return run;

  const bySource = await existingBySource(party.id);

  for (const row of produce) {
    const source: SourceState = {
      kind: "PRODUCE_HARVEST",
      sourceId: row.id,
      productId: row.productId,
      label: row.cropType,
      quantity: row.quantity,
      unit: row.unit,
      availableFrom: row.expectedHarvestDate,
      perishable: row.perishable,
    };

    const decision = decide(source, bySource.get(row.id) ?? [], now, formatQuantity);

    if (decision.action === "create") {
      const { proposal } = decision;
      await prisma.intent.create({
        data: {
          partyId: party.id,
          side: "SUPPLY",
          category: "PRODUCE",
          // The farmer's own word for the crop, with the quantity as a
          // ceiling they can reduce.
          title: `${formatQuantity(proposal.quantity, proposal.unit)} of ${proposal.label}`,
          quantity: proposal.quantity,
          unit: proposal.unit,
          productId: proposal.productId,
          countryCode: party.countryCode,
          province: party.province,
          district: party.district,
          status: "PROPOSED",
          origin: "DERIVED",
          derivationKey: proposal.derivationKey,
          urgent: proposal.urgent,
          neededBy: proposal.availableFrom,
          produceId: proposal.sourceId,
        },
      });
      run.created++;
    } else if (decision.action === "revise") {
      const { proposal } = decision;
      // Guarded on status: between reading and writing, the farmer may have
      // activated it in another tab. A revision must never overwrite an
      // intent that has become theirs.
      const updated = await prisma.intent.updateMany({
        where: { id: decision.intentId, status: "PROPOSED", origin: "DERIVED" },
        data: {
          title: `${formatQuantity(proposal.quantity, proposal.unit)} of ${proposal.label}`,
          quantity: proposal.quantity,
          unit: proposal.unit,
          productId: proposal.productId,
          derivationKey: proposal.derivationKey,
          urgent: proposal.urgent,
          neededBy: proposal.availableFrom,
        },
      });
      run.revised += updated.count;
    } else if (decision.action === "flag_divergence") {
      // Reported, not applied. The farmer made a commitment on the terms
      // they saw; FarmaTrade's job is to tell them the ground moved, not to
      // move the commitment.
      run.diverged.push({ intentId: decision.intentId, basis: decision.proposal.basis });
    }
  }

  return run;
}

export { HARVEST_WINDOW_DAYS };

// The sentence explaining a proposal, read back from its source at display
// time so it always reflects what is recorded now.
export async function basisForIntent(intentId: string): Promise<string | null> {
  const intent = await prisma.intent.findUnique({
    where: { id: intentId },
    select: {
      origin: true,
      produce: {
        select: { cropType: true, quantity: true, unit: true, expectedHarvestDate: true },
      },
    },
  });
  if (intent?.origin !== "DERIVED" || !intent.produce) return null;
  const { cropType, quantity, unit, expectedHarvestDate } = intent.produce;
  const when = expectedHarvestDate
    ? ` around ${expectedHarvestDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
    : "";
  return `Based on your recorded ${cropType.toLowerCase()}: ${formatQuantity(quantity, unit)} expected${when}.`;
}

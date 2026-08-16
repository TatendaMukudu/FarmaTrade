import "server-only";
import { prisma } from "@/lib/prisma";
import { formatQuantity } from "@/lib/units";
import { PRODUCE_UNIT_CANONICAL } from "@/lib/measurement";
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

// A ProduceUnit value's canonical identity. Total over the enum by
// construction — see PRODUCE_UNIT_CANONICAL — so this never guesses.
function canonicalFor(unit: string): string | null {
  return PRODUCE_UNIT_CANONICAL[unit as keyof typeof PRODUCE_UNIT_CANONICAL] ?? null;
}

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
      const created = await prisma.$transaction(async (tx) => {
        // The source-specific transaction lock makes the create decision
        // atomic without storing another copy of proposal state. A second
        // page render waits, rereads, and sees the first proposal.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${party.id}:${row.id}`}, 0))::text`;
        const current = await tx.intent.findMany({
          where: { partyId: party.id, origin: "DERIVED", produceId: row.id },
          select: {
            id: true,
            origin: true,
            status: true,
            derivationKey: true,
            quantity: true,
            productId: true,
          },
        });
        const lockedDecision = decide(source, current, now, formatQuantity);
        if (lockedDecision.action !== "create") return false;
        const lockedProposal = lockedDecision.proposal;
        await tx.intent.create({
          data: {
            partyId: party.id,
            side: "SUPPLY",
            category: "PRODUCE",
            // The farmer's own word for the crop, with the quantity as a
            // ceiling they can reduce.
            title: `${formatQuantity(lockedProposal.quantity, lockedProposal.unit)} of ${lockedProposal.label}`,
            quantity: lockedProposal.quantity,
            unit: lockedProposal.unit,
            // Inventory's enum maps into canonical identity through a proven
            // total function, so a derived proposal arrives with its unit
            // already machine-readable rather than as a string to re-parse.
            unitCode: canonicalFor(lockedProposal.unit),
            productId: lockedProposal.productId,
            countryCode: party.countryCode,
            province: party.province,
            district: party.district,
            status: "PROPOSED",
            origin: "DERIVED",
            derivationKey: lockedProposal.derivationKey,
            urgent: lockedProposal.urgent,
            neededBy: lockedProposal.availableFrom,
            produceId: lockedProposal.sourceId,
          },
        });
        return true;
      });
      if (created) run.created++;
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
          // Inventory's enum maps into canonical identity through a proven
          // total function, so a derived proposal arrives with its unit
          // already machine-readable rather than as a string to re-parse.
          unitCode: canonicalFor(proposal.unit),
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

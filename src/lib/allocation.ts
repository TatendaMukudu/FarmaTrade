import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  consumesCapacity,
  pairwiseQuantity,
  pairwiseUnit,
  remainingCapacity,
  unquantifiedAllocations,
  type Allocation,
} from "@/lib/capacity";
import { isAuthorizedToMatch } from "@/lib/intent";

// The authoritative write path for commercial capacity.
//
// Everything that takes capacity off the market or gives it back goes
// through here, and nothing else writes Match.quantity. That is what makes
// the invariant enforceable: allocation is one code path holding one lock,
// rather than a rule the UI is trusted to respect.
//
// It never touches inventory. Agreeing to supply eight tonnes does not move
// eight tonnes; it records that eight of the twenty a farmer authorized are
// now spoken for. Reconciling that against what is physically in the shed is
// the fulfilment layer's job and does not exist yet.

export type Capacity = {
  intentId: string;
  // What the owner authorized. Null where they never said.
  authorized: number | null;
  unit: string | null;
  // Derived, never stored. Null means unbounded.
  remaining: number | null;
  allocated: number;
  // Live engagements whose amount could not be counted — see capacity.ts.
  unquantified: number;
};

function capacityFrom(
  intent: { id: string; quantity: number | null; unit: string | null },
  allocations: Allocation[],
): Capacity {
  const remaining = remainingCapacity(intent, allocations);
  return {
    intentId: intent.id,
    authorized: intent.quantity,
    unit: intent.unit,
    remaining,
    allocated: intent.quantity == null ? 0 : intent.quantity - (remaining ?? 0),
    unquantified: unquantifiedAllocations(allocations, intent.unit),
  };
}

// Every engagement claiming against these intents, whichever side of the
// match they sit on.
//
// `exceptMatchId` leaves one engagement out of the sum. It is what stops a
// single commercial quantity being deducted twice: re-agreeing a match that
// already holds eight tonnes must weigh those eight as its own claim, not as
// somebody else's, or the second acceptance would find eight fewer tonnes
// available than really are.
async function allocationsByIntent(
  client: Prisma.TransactionClient,
  intentIds: string[],
  exceptMatchId?: string,
): Promise<Map<string, Allocation[]>> {
  const matches = await client.match.findMany({
    where: {
      OR: [{ intentAId: { in: intentIds } }, { intentBId: { in: intentIds } }],
      ...(exceptMatchId ? { id: { not: exceptMatchId } } : {}),
    },
    select: {
      intentAId: true,
      intentBId: true,
      status: true,
      quantity: true,
      unit: true,
      // A trade someone reported as never having happened releases what it
      // held. Same rule as everywhere else in the app: one side saying so
      // is enough.
      confirmations: { select: { outcome: true } },
    },
  });

  const byIntent = new Map<string, Allocation[]>(intentIds.map((id) => [id, []]));
  for (const m of matches) {
    const allocation: Allocation = {
      status: m.status,
      quantity: m.quantity,
      unit: m.unit,
      fellThrough: m.confirmations.some((c) => c.outcome === "DID_NOT_HAPPEN"),
    };
    for (const id of [m.intentAId, m.intentBId]) {
      const list = byIntent.get(id);
      if (list) list.push(allocation);
    }
  }
  return byIntent;
}

// What each of these intents still has available.
//
// Read-only and unlocked: this is the number pages display and matching
// filters on, where a value that was true a moment ago is good enough. The
// locked read that decides whether an allocation may be written lives inside
// allocateForMatch.
export async function loadCapacities(intentIds: string[]): Promise<Map<string, Capacity>> {
  if (intentIds.length === 0) return new Map();

  const intents = await prisma.intent.findMany({
    where: { id: { in: intentIds } },
    select: { id: true, quantity: true, unit: true },
  });
  const allocations = await allocationsByIntent(prisma, intentIds);

  return new Map(
    intents.map((intent) => [intent.id, capacityFrom(intent, allocations.get(intent.id) ?? [])]),
  );
}

export async function loadCapacity(intentId: string): Promise<Capacity | null> {
  return (await loadCapacities([intentId])).get(intentId) ?? null;
}

// Takes the intents out of the hands of any concurrent allocation.
//
// This is the race the whole module exists to close: two engagements against
// an intent with ten tonnes left, each reading ten before either writes,
// each concluding eight is fine. Both reads are correct and the result is
// eighteen tonnes promised against ten.
//
// Postgres row locks make the second transaction wait until the first has
// committed, so its read already includes the other's write. Ordering the
// ids means two transactions touching the same pair of intents from opposite
// directions take the locks in the same sequence and cannot deadlock.
//
// It has to be a raw statement: Prisma has no FOR UPDATE, and findMany
// inside a transaction takes no lock at all — it would read the stale ten
// just as happily outside a transaction as in.
async function lockIntents(tx: Prisma.TransactionClient, intentIds: string[]): Promise<void> {
  const ordered = [...new Set(intentIds)].sort();
  await tx.$queryRaw`SELECT id FROM "Intent" WHERE id IN (${Prisma.join(ordered)}) ORDER BY id FOR UPDATE`;
}

// Keeps ENGAGED meaning what it says.
//
// Derived from live engagements rather than set by hand, so it cannot end up
// describing a negotiation that has since fallen through. An intent with at
// least one capacity-consuming match is in discussion; one with none is
// simply available again.
//
// PROPOSED and WITHDRAWN are never touched. Those are statements about
// permission — FarmaTrade has not been given this one, or has been told no —
// and market activity is not entitled to overrule either. This is the
// P0.2C ownership rule holding: engagement moves an intent between the two
// states the owner already consented to, and nowhere else.
async function syncEngagement(tx: Prisma.TransactionClient, intentIds: string[]): Promise<void> {
  const allocations = await allocationsByIntent(tx, intentIds);

  for (const intentId of intentIds) {
    const engaged = (allocations.get(intentId) ?? []).some(consumesCapacity);
    await tx.intent.updateMany({
      where: { id: intentId, status: engaged ? "ACTIVE" : "ENGAGED" },
      data: { status: engaged ? "ENGAGED" : "ACTIVE" },
    });
  }
}

export type AllocationResult =
  | { ok: true; quantity: number | null; unit: string | null }
  | { ok: false; reason: "not_found" | "not_authorized" | "no_capacity" };

// Agree an engagement, and take the quantity it speaks for off the market.
//
// `requested` is what the parties settled on, when they said. It is clamped
// to what both sides actually have left rather than rejected outright: a
// buyer asking for twelve tonnes against ten remaining wants as much as they
// can get, and the useful answer is ten, not an error. What it can never do
// is exceed either side's remaining capacity — that is checked here, under
// the lock, against a read that no concurrent allocation can have gone
// stale behind.
//
// With no `requested`, the engagement takes the most both sides could do,
// which is the honest reading of "accept" on a match neither party has put a
// number to.
export async function allocateForMatch(
  matchId: string,
  requested?: number | null,
): Promise<AllocationResult> {
  return prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        status: true,
        intentA: { select: { id: true, side: true, status: true, quantity: true, unit: true } },
        intentB: { select: { id: true, side: true, status: true, quantity: true, unit: true } },
      },
    });
    if (!match) return { ok: false, reason: "not_found" };

    const intentIds = [match.intentA.id, match.intentB.id];
    await lockIntents(tx, intentIds);

    // Re-read behind the lock. Anything the wait let through is visible now.
    const intents = await tx.intent.findMany({
      where: { id: { in: intentIds } },
      select: { id: true, side: true, status: true, quantity: true, unit: true },
    });
    if (intents.some((i) => !isAuthorizedToMatch(i))) {
      return { ok: false, reason: "not_authorized" };
    }

    // Every other engagement's claim — this match's own row excluded, so
    // agreeing it again re-prices the same quantity instead of subtracting
    // it a second time.
    const allocations = await allocationsByIntent(tx, intentIds, matchId);
    const capacities = intents.map((i) => ({
      side: i.side,
      ...capacityFrom(i, allocations.get(i.id) ?? []),
    }));

    const supply = capacities.find((c) => c.side === "SUPPLY");
    const demand = capacities.find((c) => c.side === "DEMAND");
    if (!supply || !demand) return { ok: false, reason: "not_found" };

    const ceiling = pairwiseQuantity(supply, demand);
    const unit = pairwiseUnit(supply.unit, demand.unit);

    // No ceiling means no honest number — one side unbounded, or units that
    // cannot be compared. The engagement is still real, so it is recorded;
    // it just carries no quantity, and consumes no measured capacity.
    let quantity: number | null = ceiling;
    if (ceiling != null && requested != null && requested > 0) {
      quantity = Math.min(requested, ceiling);
    }

    if (ceiling != null && ceiling <= 0) return { ok: false, reason: "no_capacity" };

    await tx.match.update({
      where: { id: matchId },
      data: { status: "ACCEPTED", quantity, unit },
    });
    await syncEngagement(tx, intentIds);

    return { ok: true, quantity, unit };
  });
}

// Bring both sides of a match back into line with what their engagements
// now say.
//
// Needed after a confirmation, because filing one can change whether the
// engagement holds capacity at all — a trade reported as never having
// happened stops consuming, and if it was the only thing holding either
// intent, that intent is plainly available again rather than still "in
// discussion". Deriving the status rather than setting it means this is the
// same operation whatever the confirmation said.
export async function syncEngagementForMatch(matchId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({
      where: { id: matchId },
      select: { intentAId: true, intentBId: true },
    });
    if (!match) return;
    const intentIds = [match.intentAId, match.intentBId];
    await lockIntents(tx, intentIds);
    await syncEngagement(tx, intentIds);
  });
}

// Give the capacity back.
//
// Nothing has to be credited anywhere: a declined engagement stops
// satisfying consumesCapacity(), so it simply drops out of the sum the next
// time remaining is derived. The quantity stays on the row as the record of
// what was once agreed.
//
// No inventory moves, in either direction — none moved when the allocation
// was made either.
export async function releaseAllocation(matchId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({
      where: { id: matchId },
      select: { intentAId: true, intentBId: true },
    });
    if (!match) return;

    const intentIds = [match.intentAId, match.intentBId];
    await lockIntents(tx, intentIds);
    await tx.match.update({ where: { id: matchId }, data: { status: "DECLINED" } });
    await syncEngagement(tx, intentIds);
  });
}

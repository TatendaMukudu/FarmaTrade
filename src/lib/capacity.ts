// Remaining commercial capacity: how much of an intent is still available
// to match.
//
// The three quantities this module keeps apart, and the reason it exists:
//
//   FARM STATE     26 tonnes are in the shed
//   AUTHORIZED     the owner is willing to supply up to 20 of them
//   ALLOCATED      8 of those 20 are already spoken for by an engagement
//
//   REMAINING      12 — and this is the only one FarmaTrade may act on
//
// Nothing here reads or writes inventory. Farm state is upstream of the
// authorized number and is reconciled only by a fulfilment layer that does
// not exist yet; see lib/intent.ts for that boundary. A match consuming
// capacity does not mean a tonne has moved.
//
// Remaining is DERIVED on every read rather than stored. There is no
// `allocatedQuantity` column to fall out of step with the engagements that
// justify it — the sum below is the only definition of the number, so a bug
// can make it wrong but nothing can make it stale.
//
// Pure and DB-free.

import type { MatchStatus } from "@/generated/prisma/client";
import { normalizeUnit, unitsComparable } from "@/lib/units";

// One engagement's claim on an intent's capacity.
export type Allocation = {
  status: MatchStatus;
  // Null where no amount was ever agreed. See consumesCapacity().
  quantity: number | null;
  unit: string | null;
  // Someone reported the trade never happened. Same rule the rest of the
  // app uses — one side saying so is enough (see match-ranking.ts,
  // trade-outcomes.ts).
  fellThrough?: boolean;
};

// Which engagements actually take capacity off the market.
//
// ACCEPTED is allocation: both sides are pursuing this trade, so promising
// the same tonnes to somebody else would be FarmaTrade double-selling on a
// farmer's behalf. COMPLETED is commitment: the trade was reported as done,
// so the capacity is spent rather than freed.
//
// The same eight tonnes therefore move from allocated to committed without
// ever being counted twice — one row, one number, a changing status. There
// is no second record for a commitment to live in, so there is nothing for
// the arithmetic to double.
//
// SUGGESTED does not consume. A suggestion nobody has answered is
// FarmaTrade's opinion, and an intent with forty suggestions against it has
// not thereby sold anything.
//
// DECLINED does not consume, which is the whole release mechanism: a
// declined engagement simply stops appearing in the sum, and the capacity is
// available again on the next read. Nothing has to remember to give it back.
//
// Neither does an engagement someone reported as never having happened. It
// reaches COMPLETED because both sides filed a report and the reports are
// what "completed" means, but a trade that fell through has not consumed a
// single tonne, and leaving it holding capacity would quietly strand a
// farmer's supply behind a deal that never occurred.
export function consumesCapacity(
  allocation: { status: MatchStatus; fellThrough?: boolean },
): boolean {
  if (allocation.fellThrough) return false;
  return allocation.status === "ACCEPTED" || allocation.status === "COMPLETED";
}

// How much of an intent's authorized quantity is currently spoken for.
//
// `unit` is the intent's own unit, and allocations denominated in anything
// else are excluded rather than added. That is not tidiness: adding 1 to 20
// because one row says tonnes and the other says kg would understate what is
// left by a factor of a thousand, and the number would look completely
// ordinary. An allocation that cannot be counted is reported separately (see
// unquantifiedAllocations) instead of being silently folded in.
export function allocatedQuantity(
  allocations: readonly Allocation[],
  unit: string | null | undefined,
): number {
  return allocations.reduce((sum, a) => {
    if (!consumesCapacity(a)) return sum;
    if (a.quantity == null || a.quantity <= 0) return sum;
    if (!unitsComparable(a.unit, unit)) return sum;
    return sum + a.quantity;
  }, 0);
}

// Engagements that are live but carry no countable quantity — either no
// amount was agreed, or the units could not be compared.
//
// Worth surfacing rather than discarding: an intent with three such
// engagements is plainly busier than its remaining number suggests, and a
// farmer should be told that instead of being quietly reassured.
export function unquantifiedAllocations(
  allocations: readonly Allocation[],
  unit: string | null | undefined,
): number {
  return allocations.filter(
    (a) =>
      consumesCapacity(a) &&
      (a.quantity == null || a.quantity <= 0 || !unitsComparable(a.unit, unit)),
  ).length;
}

// What an intent still has available.
//
// Null means UNBOUNDED, not zero, and the distinction is the difference
// between honesty and a bug. An intent with no quantity — most transport,
// most equipment, and any listing whose owner never said how much — has not
// declared a ceiling, so FarmaTrade has no basis to declare it exhausted.
// Treating null as 0 would take every unquantified intent off the market the
// moment this shipped.
//
// Never negative: an over-allocation that somehow got written is reported as
// nothing left, not as a negative capacity that would then read as "less
// than zero available" everywhere downstream.
export function remainingCapacity(
  intent: { quantity: number | null; unit: string | null },
  allocations: readonly Allocation[],
): number | null {
  if (intent.quantity == null) return null;
  return Math.max(0, intent.quantity - allocatedQuantity(allocations, intent.unit));
}

// Whether there is any capacity left to offer anyone.
//
// Unbounded counts as available, for the reason given above.
export function hasRemainingCapacity(remaining: number | null): boolean {
  return remaining === null || remaining > 0;
}

// The most two parties could transact right now, given what each has left.
//
// Bounded by the smaller side, because that is what "up to" means from both
// directions: a supplier with 12 tonnes left and a buyer still needing 30
// can do 12, and saying 30 would be promising the buyer something nobody
// has.
//
// Null where no honest number exists — either side unbounded, or units that
// cannot be compared. Null is a real answer here: these parties can still
// trade, FarmaTrade just cannot say how much, and it should say so rather
// than pick a plausible figure.
//
// Partial fulfilment is the normal case, not a mismatch. A 100-tonne buyer
// is expected to be satisfied by several suppliers, and nothing in this
// function requires the two sides to be equal or even close.
export function pairwiseQuantity(
  supply: { remaining: number | null; unit: string | null },
  demand: { remaining: number | null; unit: string | null },
): number | null {
  if (!unitsComparable(supply.unit, demand.unit)) return null;
  if (supply.remaining === null || demand.remaining === null) return null;
  const bounded = Math.min(supply.remaining, demand.remaining);
  return bounded > 0 ? bounded : null;
}

// The unit a pairwise quantity is denominated in — whichever side actually
// named one. Only ever called where the units already compare, so this
// picks between "tonnes" and "unstated" rather than between two real units.
export function pairwiseUnit(
  supplyUnit: string | null | undefined,
  demandUnit: string | null | undefined,
): string | null {
  return normalizeUnit(supplyUnit) ?? normalizeUnit(demandUnit);
}

// How much of a demand is covered by what is actually on the table.
//
// Deliberately takes REMAINING capacity per counterparty rather than their
// headline quantity: a supplier offering 40 tonnes who has already engaged
// 35 of them contributes 5 to a buyer's coverage, and counting the 40 would
// tell the buyer their order was covered when it is not.
export function combinedRemaining(
  remainings: readonly (number | null)[],
): { total: number; unbounded: number } {
  let total = 0;
  let unbounded = 0;
  for (const r of remainings) {
    if (r === null) unbounded++;
    else total += r;
  }
  return { total, unbounded };
}

// Remaining commercial capacity: how much of an intent is still available
// to match.
//
// The three quantities this module keeps apart, and the reason it exists:
//
//   FARM STATE     26 tonnes are in the shed
//   AUTHORIZED     the owner is willing to supply up to 20 of them
//   RESERVED       8 of those 20 are held by a bilateral agreement
//
//   REMAINING      12 — and this is the only one FarmaTrade may act on
//
// Nothing here reads or writes inventory. Farm state is upstream of the
// authorized number and is reconciled only by a fulfilment layer that does
// not exist yet; see lib/intent.ts for that boundary. An agreement
// reserving capacity does not mean a tonne has moved.
//
// Remaining is DERIVED on every read rather than stored. There is no
// column to fall out of step with the agreements that justify it.
//
// All arithmetic happens in canonical units. A farmer offering 2 tonnes who
// agreed 750 kg with one buyer and 0.5 tonnes with another has 750 kg left,
// and getting that right means the numbers are converted to one basis
// before anything is subtracted — never compared as raw floats that happen
// to sit next to different words. Rendering back into whatever the farmer
// typed is a separate step and happens after the arithmetic, never during.
//
// Pure and DB-free.

import type { Reservation } from "@/lib/agreement-core";
import {
  BASE_UNIT,
  UNITS,
  convertQuantity,
  coversQuantity,
  toCanonical,
  unitByCode,
  type CanonicalUnit,
} from "@/lib/measurement";

// One engagement's claim on an intent's capacity.
//
// This is a Reservation — the output of agreement-core's one authoritative
// predicate, which decides whether an engagement reserves anything and how
// much. Nothing in this module re-derives that from a status, so there is
// no second copy of the bilateral-consent rule to drift out of step with
// the first.
export type Allocation = Reservation;

// Whether an engagement's claim counts against capacity at all.
//
// Thin by design: the judgement lives in agreement-core.reservationFor(),
// and this is only the local reading of its answer.
export function consumesCapacity(allocation: Pick<Allocation, "reserves">): boolean {
  return allocation.reserves;
}

// Why a live agreement could not be counted against an intent's capacity.
//
// Four genuinely different problems, and telling them apart is the point —
// a farmer who has agreed something in bags needs to be told that FarmaTrade
// cannot weigh bags, not that something unspecified went wrong. The UI must
// never have to guess which it was.
export type UnmeasurableReason =
  // Nobody put a number on the agreement.
  | "no_quantity"
  // The agreement or the intent names a unit FarmaTrade does not recognise.
  | "unknown_unit"
  // Mass against volume, or a count against a mass. No conversion exists.
  | "incompatible_dimension"
  // Bags against kilograms. A conversion may exist for this particular
  // deal; it is not a fact about the words, and FarmaTrade will not invent
  // one. See the packaging note in measurement.ts.
  | "context_required";

export type Unmeasured = Record<UnmeasurableReason, number>;

const NO_UNMEASURED: Unmeasured = {
  no_quantity: 0,
  unknown_unit: 0,
  incompatible_dimension: 0,
  context_required: 0,
};

// The canonical unit an intent's capacity arithmetic happens in.
//
// Null when the intent named no unit, or named one FarmaTrade cannot
// resolve. Both mean the same thing for arithmetic — there is no basis to
// convert anything into — but they are different facts about the intent and
// the caller is told which.
export function basisFor(intent: { unitCode: string | null | undefined }): CanonicalUnit | null {
  const unit = unitByCode(intent.unitCode);
  if (!unit) return null;
  const base = BASE_UNIT[unit.dimension];
  // Packages have no base; they are their own canonical form.
  return base == null ? unit : UNITS[base];
}

// Everything known about one intent's commercial capacity, in one shape.
//
// The numbers are all in `basis`. Rendering them in whatever the owner
// originally typed is the caller's job and happens afterwards — mixing the
// two is how a display decision becomes a commercial one.
export type CapacityReading = {
  // What the owner authorized, canonical. Null means no ceiling was stated.
  authorized: number | null;
  // Held by bilateral agreements, canonical.
  reserved: number;
  // What is left. Null means unbounded, never empty.
  remaining: number | null;
  // How much more is agreed than is now authorized. See below.
  overcommitted: number;
  // The unit the three figures above are in. Null when the intent has no
  // resolvable unit, in which case they are in whatever the intent's own
  // numbers were and only same-unit agreements were counted.
  basis: CanonicalUnit | null;
  // Live agreements that could not be counted, and why.
  unmeasured: Unmeasured;
};

// One agreement's contribution to an intent's reserved total.
//
// Returns either a canonical number or the reason there isn't one. This is
// the single place a reservation meets an intent's unit, so it is the only
// place a wrong answer could come from.
function contributionOf(
  allocation: Allocation,
  basis: CanonicalUnit | null,
): { ok: true; value: number } | { ok: false; reason: UnmeasurableReason } {
  if (allocation.quantity == null || allocation.quantity <= 0) {
    return { ok: false, reason: "no_quantity" };
  }

  const from = unitByCode(allocation.unitCode);

  // Neither side named a resolvable unit. Two bare numbers about the same
  // intent are the same measure by construction — the intent's own — so
  // they add. This is what keeps unit-less intents working exactly as they
  // did before canonical units existed.
  if (!from && !basis) return { ok: true, value: allocation.quantity };

  if (!from) return { ok: false, reason: "unknown_unit" };
  if (!basis) return { ok: false, reason: "unknown_unit" };

  const converted = convertQuantity(allocation.quantity, from, basis);
  if (converted.ok) return { ok: true, value: converted.value };
  return {
    ok: false,
    reason: converted.reason === "context_required" ? "context_required" : "incompatible_dimension",
  };
}

// Physical farm state is a hard ceiling, unlike an intent whose unknown
// measurement can remain commercially visible. A commitment must therefore
// be provably comparable with its source: an unweighed BAG is not a KG and a
// CRATE is not a TONNE. Callers receive the precise measurement failure so
// they can tell the owner whether to keep the terms in the package unit or
// deliberately revise the farm record.
export function fitsWithinPhysicalSource(
  reading: CapacityReading,
  required: number | null,
  unitCode: string | null | undefined,
): FitResult {
  if (required == null) return { fits: false, reason: "no_quantity" };
  if (reading.remaining === null) return { fits: false, reason: "unknown_unit" };

  const contribution = contributionOf(
    { reserves: true, quantity: required, unit: null, unitCode: unitCode ?? null, basis: "mutual_agreement" },
    reading.basis,
  );
  if (!contribution.ok) return { fits: false, reason: contribution.reason };

  return coversQuantity(reading.remaining, contribution.value)
    ? { fits: true, canonical: contribution.value }
    : { fits: false, reason: "insufficient" };
}

// What an intent has authorized, reserved and left, in one canonical pass.
export function readCapacity(
  intent: { quantity: number | null; unitCode: string | null | undefined },
  allocations: readonly Allocation[],
): CapacityReading {
  const basis = basisFor(intent);
  const unmeasured: Unmeasured = { ...NO_UNMEASURED };

  let reserved = 0;
  for (const allocation of allocations) {
    if (!consumesCapacity(allocation)) continue;
    const contribution = contributionOf(allocation, basis);
    if (contribution.ok) reserved += contribution.value;
    else unmeasured[contribution.reason] += 1;
  }

  // The intent's own authorized figure, put on the same footing.
  const intentUnit = unitByCode(intent.unitCode);
  const authorized =
    intent.quantity == null
      ? null
      : intentUnit
        ? toCanonical(intent.quantity, intentUnit).value
        : intent.quantity;

  // Null means UNBOUNDED, not zero, and the distinction is the difference
  // between honesty and a bug. An intent with no quantity — most transport,
  // most equipment, and any listing whose owner never said how much — has
  // not declared a ceiling, so FarmaTrade has no basis to declare it
  // exhausted. Treating null as 0 would take every unquantified intent off
  // the market the moment this shipped.
  const remaining = authorized == null ? null : Math.max(0, authorized - reserved);

  // Positive only when an owner edits an intent below what they already
  // agreed away — authorized 20, agreed 26, then edited to 15. Reported
  // rather than resolved: FarmaTrade must not quietly reduce agreements a
  // counterparty is relying on, must not invent a compensating quantity,
  // and must not touch inventory. What it can do is stop pretending the
  // numbers add up.
  const overcommitted = authorized == null ? 0 : Math.max(0, reserved - authorized);

  return { authorized, reserved, remaining, overcommitted, basis, unmeasured };
}

// How many live agreements could not be counted at all.
export function unmeasuredCount(unmeasured: Unmeasured): number {
  return Object.values(unmeasured).reduce((sum, n) => sum + n, 0);
}

// Whether there is any capacity left to offer anyone.
//
// Unbounded counts as available, for the reason given above.
export function hasRemainingCapacity(remaining: number | null): boolean {
  return remaining === null || remaining > 0;
}

// Whether an intent can still take on `required`, expressed in `unit`.
//
// Tolerant of floating-point drift by a microgram, so the last agreement
// that exactly fills an intent is never refused over 0.0000000002 left
// behind by a conversion.
//
// An agreement FarmaTrade cannot measure against this intent does not fit
// and does not fail — it is simply not a quantity question, and the caller
// decides what to do about that.
export type FitResult =
  | { fits: true; canonical: number | null }
  | { fits: false; reason: "insufficient" | UnmeasurableReason };

export function fitsWithin(
  reading: CapacityReading,
  required: number | null,
  unitCode: string | null | undefined,
): FitResult {
  if (required == null) return { fits: true, canonical: null };
  if (reading.remaining === null) return { fits: true, canonical: null };

  const contribution = contributionOf(
    { reserves: true, quantity: required, unit: null, unitCode: unitCode ?? null, basis: "mutual_agreement" },
    reading.basis,
  );
  // Not measurable against this intent, so there is nothing to check. It
  // reserves nothing and is reported in the diagnostics instead.
  if (!contribution.ok) return { fits: true, canonical: null };

  return coversQuantity(reading.remaining, contribution.value)
    ? { fits: true, canonical: contribution.value }
    : { fits: false, reason: "insufficient" };
}

// The most two parties could transact right now, given what each has left.
//
// Bounded by the smaller side, because that is what "up to" means from both
// directions: a supplier with 12 tonnes left and a buyer still needing 30
// can do 12, and saying 30 would be promising the buyer something nobody
// has.
//
// Now works across units: a supplier with 2 tonnes and a buyer needing
// 500 kg meet at 500 kg. Null where no honest number exists — either side
// unbounded, or bases that cannot be brought together. Null is a real
// answer: these parties can still trade, FarmaTrade just cannot say how
// much, and it should say so rather than pick a plausible figure.
//
// Partial fulfilment is the normal case, not a mismatch. A 100-tonne buyer
// is expected to be satisfied by several suppliers, and nothing here
// requires the two sides to be equal or even close.
export function pairwiseQuantity(
  supply: { remaining: number | null; basis: CanonicalUnit | null },
  demand: { remaining: number | null; basis: CanonicalUnit | null },
): { value: number; unit: CanonicalUnit | null } | null {
  if (supply.remaining === null || demand.remaining === null) return null;

  // Neither side has a resolvable unit: both numbers are bare, and the only
  // honest reading is that they are the same measure.
  if (!supply.basis && !demand.basis) {
    const value = Math.min(supply.remaining, demand.remaining);
    return value > 0 ? { value, unit: null } : null;
  }
  if (!supply.basis || !demand.basis) return null;

  const converted = convertQuantity(demand.remaining, demand.basis, supply.basis);
  if (!converted.ok) return null;

  const value = Math.min(supply.remaining, converted.value);
  return value > 0 ? { value, unit: supply.basis } : null;
}

// How much of a demand is covered by what is actually on the table.
//
// Deliberately takes REMAINING capacity per counterparty rather than their
// headline quantity: a supplier offering 40 tonnes who has already agreed
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

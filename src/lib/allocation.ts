import "server-only";
import { prisma } from "@/lib/prisma";
import { readCapacity, unmeasuredCount, type Allocation, type Unmeasured } from "@/lib/capacity";
import { reservationsByIntent } from "@/lib/agreement";
import { unitByCode, type CanonicalUnit } from "@/lib/measurement";

// Reading commercial capacity.
//
// What each intent has authorized, what bilateral agreements have reserved
// of it, and what is therefore left. Writing is agreement.ts's job — an
// engagement reserves capacity by both parties agreeing to the same terms,
// never by anything that happens here.
//
// Nothing in this module touches inventory. Reconciling agreed quantities
// against what is physically in the shed belongs to a fulfilment layer that
// does not exist yet.

export type Capacity = {
  intentId: string;
  // All canonical, all in `basis`. What the owner authorized, what
  // bilateral agreements hold, and what is left.
  authorized: number | null;
  reserved: number;
  remaining: number | null;
  overcommitted: number;
  // The canonical unit the four figures above are in. Null where the intent
  // named no unit or one FarmaTrade cannot resolve, in which case they are
  // bare numbers and only same-basis agreements were counted.
  basis: CanonicalUnit | null;
  // The unit the owner originally typed, and its canonical identity — for
  // rendering the figures back in their own words.
  displayUnit: string | null;
  unitCode: string | null;
  // Live agreements that could not be counted, broken down by why. The UI
  // must never have to guess whether a number is missing because nobody
  // stated one, because the unit is unrecognised, or because bags do not
  // convert to tonnes.
  unmeasured: Unmeasured;
  unquantified: number;
};

function capacityFrom(
  intent: { id: string; quantity: number | null; unit: string | null; unitCode: string | null },
  reservations: Allocation[],
): Capacity {
  const reading = readCapacity(intent, reservations);
  return {
    intentId: intent.id,
    authorized: reading.authorized,
    reserved: reading.reserved,
    remaining: reading.remaining,
    overcommitted: reading.overcommitted,
    basis: reading.basis,
    displayUnit: intent.unit,
    unitCode: intent.unitCode,
    unmeasured: reading.unmeasured,
    unquantified: unmeasuredCount(reading.unmeasured),
  };
}

// The canonical unit an intent's own figures are expressed in, for callers
// that need to pair two intents up (see capacity.pairwiseQuantity).
export function basisOf(capacity: Capacity | undefined): CanonicalUnit | null {
  return capacity?.basis ?? null;
}

export { unitByCode };

// What each of these intents still has available.
//
// Read-only and unlocked: this is the number pages display and matching
// filters on, where a value that was true a moment ago is good enough. The
// locked read that decides whether an agreement may be finalized lives
// inside agreement.acceptTerms().
export async function loadCapacities(intentIds: string[]): Promise<Map<string, Capacity>> {
  if (intentIds.length === 0) return new Map();

  const intents = await prisma.intent.findMany({
    where: { id: { in: intentIds } },
    select: { id: true, quantity: true, unit: true, unitCode: true },
  });
  const reservations = await reservationsByIntent(prisma, intentIds);

  return new Map(
    intents.map((intent) => [intent.id, capacityFrom(intent, reservations.get(intent.id) ?? [])]),
  );
}

export async function loadCapacity(intentId: string): Promise<Capacity | null> {
  return (await loadCapacities([intentId])).get(intentId) ?? null;
}

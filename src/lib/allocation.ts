import "server-only";
import { prisma } from "@/lib/prisma";
import {
  overcommitment,
  remainingCapacity,
  unquantifiedAllocations,
  type Allocation,
} from "@/lib/capacity";
import { reservationsByIntent } from "@/lib/agreement";

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
  // What the owner authorized. Null where they never said.
  authorized: number | null;
  unit: string | null;
  // Derived, never stored. Null means unbounded.
  remaining: number | null;
  reserved: number;
  // Live agreements whose amount could not be counted — no quantity agreed,
  // or units that cannot be compared.
  unquantified: number;
  // How much more is agreed than is currently authorized. Positive only
  // when an owner edits an intent below what they already agreed away; see
  // capacity.ts for why this is reported rather than resolved.
  overcommitted: number;
};

function capacityFrom(
  intent: { id: string; quantity: number | null; unit: string | null },
  reservations: Allocation[],
): Capacity {
  const remaining = remainingCapacity(intent, reservations);
  return {
    intentId: intent.id,
    authorized: intent.quantity,
    unit: intent.unit,
    remaining,
    reserved: intent.quantity == null ? 0 : intent.quantity - (remaining ?? 0),
    unquantified: unquantifiedAllocations(reservations, intent.unit),
    overcommitted: overcommitment(intent, reservations),
  };
}

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
    select: { id: true, quantity: true, unit: true },
  });
  const reservations = await reservationsByIntent(prisma, intentIds);

  return new Map(
    intents.map((intent) => [intent.id, capacityFrom(intent, reservations.get(intent.id) ?? [])]),
  );
}

export async function loadCapacity(intentId: string): Promise<Capacity | null> {
  return (await loadCapacities([intentId])).get(intentId) ?? null;
}

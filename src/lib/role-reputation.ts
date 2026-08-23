import "server-only";
import { prisma } from "@/lib/prisma";
import {
  emptyRoleRecord,
  roleOutcomesFrom,
  type RoleScopedRecord,
} from "@/lib/reputation-core";

// Role-scoped outcomes, derived rather than stored.
//
// INV-10. Nothing here is a new counter: a party's role in a match is the side
// of their own intent, so the record already contains the answer and a cached
// column would only be a second copy that can drift.
export async function roleOutcomesFor(partyId: string): Promise<RoleScopedRecord> {
  const rows = await prisma.transactionConfirmation.findMany({
    where: { partyId },
    select: {
      outcome: true,
      match: {
        select: {
          intentA: { select: { partyId: true, side: true } },
          intentB: { select: { partyId: true, side: true } },
        },
      },
    },
  });

  return roleOutcomesFrom(
    rows.flatMap((row) => {
      // The confirming party's OWN side. A confirmation whose match no longer
      // has this party on either intent is not attributable to a role, so it
      // is left out rather than guessed into one.
      const mine =
        row.match.intentA.partyId === partyId
          ? row.match.intentA
          : row.match.intentB.partyId === partyId
            ? row.match.intentB
            : null;
      return mine ? [{ outcome: row.outcome, side: mine.side }] : [];
    }),
  );
}

// The same derivation for several parties at once, so a page that lists
// counterparties does not run a query per row.
export async function roleOutcomesForMany(
  partyIds: readonly string[],
): Promise<Map<string, RoleScopedRecord>> {
  const result = new Map<string, RoleScopedRecord>();
  for (const id of partyIds) result.set(id, emptyRoleRecord());
  if (partyIds.length === 0) return result;

  const rows = await prisma.transactionConfirmation.findMany({
    where: { partyId: { in: [...partyIds] } },
    select: {
      partyId: true,
      outcome: true,
      match: {
        select: {
          intentA: { select: { partyId: true, side: true } },
          intentB: { select: { partyId: true, side: true } },
        },
      },
    },
  });

  const byParty = new Map<string, { outcome: typeof rows[number]["outcome"]; side: string }[]>();
  for (const row of rows) {
    const mine =
      row.match.intentA.partyId === row.partyId
        ? row.match.intentA
        : row.match.intentB.partyId === row.partyId
          ? row.match.intentB
          : null;
    if (!mine) continue;
    const list = byParty.get(row.partyId) ?? [];
    list.push({ outcome: row.outcome, side: mine.side });
    byParty.set(row.partyId, list);
  }

  for (const [id, list] of byParty) result.set(id, roleOutcomesFrom(list));
  return result;
}

import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

// Recomputed from Match history rather than incremented in place, same
// discipline as recomputeReputation — a repeat-trading-pair signal that's
// an emergent view over the graph, not a separately tracked counter.
//
// Optional transaction client, same reasoning as recomputeReputation: the
// caller that just flipped a Match to COMPLETED wants this recomputed
// against that same transaction's view, not a separate round trip that
// could race with a concurrent confirmation.
export async function recomputeRelation(partyId1: string, partyId2: string, db: Prisma.TransactionClient = prisma) {
  const [partyAId, partyBId] = [partyId1, partyId2].sort();

  const completedCount = await db.match.count({
    where: {
      status: "COMPLETED",
      OR: [
        { postA: { partyId: partyAId }, postB: { partyId: partyBId } },
        { postA: { partyId: partyBId }, postB: { partyId: partyAId } },
      ],
    },
  });

  if (completedCount === 0) return;

  await db.relation.upsert({
    where: {
      partyAId_partyBId_kind: { partyAId, partyBId, kind: "PREFERRED_PARTNER" },
    },
    create: { partyAId, partyBId, kind: "PREFERRED_PARTNER", strength: completedCount },
    update: { strength: completedCount },
  });
}

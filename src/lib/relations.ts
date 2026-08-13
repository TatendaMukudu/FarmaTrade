import "server-only";
import { prisma } from "@/lib/prisma";

// Recomputed from Match history rather than incremented in place, same
// discipline as recomputeReputation — a repeat-trading-pair signal that's
// an emergent view over the graph, not a separately tracked counter.
export async function recomputeRelation(partyId1: string, partyId2: string) {
  const [partyAId, partyBId] = [partyId1, partyId2].sort();

  const completedCount = await prisma.match.count({
    where: {
      status: "COMPLETED",
      OR: [
        { intentA: { partyId: partyAId }, intentB: { partyId: partyBId } },
        { intentA: { partyId: partyBId }, intentB: { partyId: partyAId } },
      ],
    },
  });

  if (completedCount === 0) return;

  await prisma.relation.upsert({
    where: {
      partyAId_partyBId_kind: { partyAId, partyBId, kind: "PREFERRED_PARTNER" },
    },
    create: { partyAId, partyBId, kind: "PREFERRED_PARTNER", strength: completedCount },
    update: { strength: completedCount },
  });
}

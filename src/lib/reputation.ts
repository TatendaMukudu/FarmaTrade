import "server-only";
import { prisma } from "@/lib/prisma";
import { summarizeReputation, MIN_RATINGS_FOR_AVERAGE } from "@/lib/reputation-core";
import type { ReputationSummary } from "@/lib/reputation-core";

export { summarizeReputation, MIN_RATINGS_FOR_AVERAGE };
export type { ReputationSummary };

// Recomputed from source rows rather than incremented in place, so it's
// always consistent even if called redundantly.
//
// completedCount comes from this party's own TransactionConfirmation rows
// (did *they* go through with what they said, self-reported — the known
// weak point until a payment aggregator gives a verified signal).
// averageRating comes from Rating rows where this party is the *subject*,
// i.e. what counterparties said about them — that's the peer-trust signal.
//
// didNotHappenCount is counted but held apart from completedCount — the
// party said the trade fell through, which is not a completed trade and must
// not be averaged into one. It was previously collected and discarded
// entirely; read-time ranking now uses it, which is the only reason it needs
// to be here rather than derived on demand.
export async function recomputeReputation(partyId: string) {
  const [completedGoodCount, completedIssueCount, didNotHappenCount, ratingAgg] = await Promise.all([
    prisma.transactionConfirmation.count({
      where: { partyId, outcome: "COMPLETED_GOOD" },
    }),
    prisma.transactionConfirmation.count({
      where: { partyId, outcome: "COMPLETED_ISSUE" },
    }),
    prisma.transactionConfirmation.count({
      where: { partyId, outcome: "DID_NOT_HAPPEN" },
    }),
    prisma.rating.aggregate({
      where: { subjectId: partyId },
      _avg: { score: true },
      _count: { score: true },
    }),
  ]);

  await prisma.reputation.upsert({
    where: { partyId },
    create: {
      partyId,
      completedCount: completedGoodCount + completedIssueCount,
      completedGoodCount,
      completedIssueCount,
      didNotHappenCount,
      averageRating: ratingAgg._avg.score,
      ratingCount: ratingAgg._count.score,
    },
    update: {
      completedCount: completedGoodCount + completedIssueCount,
      completedGoodCount,
      completedIssueCount,
      didNotHappenCount,
      averageRating: ratingAgg._avg.score,
      ratingCount: ratingAgg._count.score,
    },
  });
}

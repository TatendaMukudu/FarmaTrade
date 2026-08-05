import "server-only";
import { prisma } from "@/lib/prisma";

// Recomputed from source rows rather than incremented in place, so it's
// always consistent even if called redundantly.
//
// completedCount comes from this party's own TransactionConfirmation rows
// (did *they* go through with what they said, self-reported — the known
// weak point until a payment aggregator gives a verified signal).
// averageRating comes from Rating rows where this party is the *subject*,
// i.e. what counterparties said about them — that's the peer-trust signal.
export async function recomputeReputation(partyId: string) {
  const [completedGoodCount, completedIssueCount, ratingAgg] = await Promise.all([
    prisma.transactionConfirmation.count({
      where: { partyId, outcome: "COMPLETED_GOOD" },
    }),
    prisma.transactionConfirmation.count({
      where: { partyId, outcome: "COMPLETED_ISSUE" },
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
      averageRating: ratingAgg._avg.score,
      ratingCount: ratingAgg._count.score,
    },
    update: {
      completedCount: completedGoodCount + completedIssueCount,
      completedGoodCount,
      completedIssueCount,
      averageRating: ratingAgg._avg.score,
      ratingCount: ratingAgg._count.score,
    },
  });
}

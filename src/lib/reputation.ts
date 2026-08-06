import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
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
// Takes an optional transaction client so callers writing the source rows
// (TransactionConfirmation, Rating) in the same transaction can recompute
// against a consistent view without a separate round trip — defaults to
// the top-level client for callers outside a transaction.
export async function recomputeReputation(partyId: string, db: Prisma.TransactionClient = prisma) {
  const [completedGoodCount, completedIssueCount, ratingAgg] = await Promise.all([
    db.transactionConfirmation.count({
      where: { partyId, outcome: "COMPLETED_GOOD" },
    }),
    db.transactionConfirmation.count({
      where: { partyId, outcome: "COMPLETED_ISSUE" },
    }),
    db.rating.aggregate({
      where: { subjectId: partyId },
      _avg: { score: true },
      _count: { score: true },
    }),
  ]);

  await db.reputation.upsert({
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

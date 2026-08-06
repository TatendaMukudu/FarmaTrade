import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { summarizeReputation, MIN_RATINGS_FOR_AVERAGE } from "@/lib/reputation-core";
import type { ReputationSummary } from "@/lib/reputation-core";
import { buildTrustProfile } from "@/lib/trust-core";
import type { TrustProfile } from "@/lib/trust-core";
import type { TrustDimension } from "@/generated/prisma/enums";

export { summarizeReputation, MIN_RATINGS_FOR_AVERAGE, buildTrustProfile };
export type { ReputationSummary, TrustProfile };

const DIMENSION_FIELD: Record<TrustDimension, string> = {
  COMMUNICATION: "communicationAvg",
  RELIABILITY: "reliabilityAvg",
  QUALITY: "qualityAvg",
  PAYMENT: "paymentAvg",
  TIMELINESS: "timelinessAvg",
  FAIRNESS: "fairnessAvg",
};

// How many distinct counterparties completed a *second* trade with this
// party. The hardest signal on the platform to fake and the most predictive
// one it has: a single good rating costs a counterparty nothing, but coming
// back is them betting their own money a second time.
async function countRepeatPartners(partyId: string, db: Prisma.TransactionClient) {
  const completed = await db.match.findMany({
    where: {
      status: "COMPLETED",
      OR: [{ postA: { partyId } }, { postB: { partyId } }],
    },
    select: {
      postA: { select: { partyId: true } },
      postB: { select: { partyId: true } },
    },
  });

  const tradesPerCounterparty = new Map<string, number>();
  for (const m of completed) {
    const counterpartyId = m.postA.partyId === partyId ? m.postB.partyId : m.postA.partyId;
    tradesPerCounterparty.set(counterpartyId, (tradesPerCounterparty.get(counterpartyId) ?? 0) + 1);
  }

  let repeat = 0;
  for (const count of tradesPerCounterparty.values()) if (count >= 2) repeat += 1;
  return repeat;
}

// Median minutes from a conversation's first message to this party's first
// reply in it. Median, not mean, because one holiday two months ago
// shouldn't define how responsive someone looks forever.
async function medianResponseMinutes(partyId: string, db: Prisma.TransactionClient) {
  const conversations = await db.conversation.findMany({
    where: {
      messages: { some: { authorId: partyId } },
      match: {
        OR: [{ postA: { partyId } }, { postB: { partyId } }],
      },
    },
    select: {
      messages: {
        select: { authorId: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
    // Bounded: responsiveness is a current-behaviour signal, and scanning a
    // party's entire message history to compute it would grow without limit
    // on a path that runs inside a trade-completion transaction.
    take: 100,
    orderBy: { createdAt: "desc" },
  });

  const gaps: number[] = [];
  for (const c of conversations) {
    const first = c.messages[0];
    // Only counts when the *other* side opened — replying to yourself isn't
    // a response time.
    if (!first || first.authorId === partyId) continue;
    const reply = c.messages.find((m) => m.authorId === partyId);
    if (!reply) continue;
    gaps.push((reply.createdAt.getTime() - first.createdAt.getTime()) / 60_000);
  }

  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const value = gaps.length % 2 === 0 ? (gaps[mid - 1] + gaps[mid]) / 2 : gaps[mid];
  return Math.round(value);
}

// Recomputed from source rows rather than incremented in place, so it's
// always consistent even if called redundantly.
//
// completedCount comes from this party's own TransactionConfirmation rows
// (did *they* go through with what they said, self-reported — the known
// weak point until a payment aggregator gives a verified signal).
// averageRating and the per-dimension averages come from Rating rows where
// this party is the *subject*, i.e. what counterparties said about them.
//
// Takes an optional transaction client so callers writing the source rows
// (TransactionConfirmation, Rating) in the same transaction can recompute
// against a consistent view without a separate round trip — defaults to
// the top-level client for callers outside a transaction.
export async function recomputeReputation(partyId: string, db: Prisma.TransactionClient = prisma) {
  const [
    completedGoodCount,
    completedIssueCount,
    ratingAgg,
    dimensionAgg,
    repeatPartnerCount,
    responseMinutes,
  ] = await Promise.all([
    db.transactionConfirmation.count({ where: { partyId, outcome: "COMPLETED_GOOD" } }),
    db.transactionConfirmation.count({ where: { partyId, outcome: "COMPLETED_ISSUE" } }),
    db.rating.aggregate({
      where: { subjectId: partyId },
      _avg: { score: true },
      _count: { score: true },
    }),
    db.ratingDimension.groupBy({
      by: ["dimension"],
      where: { rating: { subjectId: partyId } },
      _avg: { score: true },
      _count: { score: true },
    }),
    countRepeatPartners(partyId, db),
    medianResponseMinutes(partyId, db),
  ]);

  // Each dimension stays null until somebody actually rated it — never
  // back-filled from the overall score, which would invent a precision no
  // rater supplied and make an unanswered dimension indistinguishable from
  // a genuinely average one.
  const dimensionValues: Record<string, number | null> = {
    communicationAvg: null,
    reliabilityAvg: null,
    qualityAvg: null,
    paymentAvg: null,
    timelinessAvg: null,
    fairnessAvg: null,
  };
  let dimensionCount = 0;
  for (const row of dimensionAgg) {
    dimensionValues[DIMENSION_FIELD[row.dimension]] = row._avg.score;
    dimensionCount = Math.max(dimensionCount, row._count.score);
  }

  const values = {
    completedCount: completedGoodCount + completedIssueCount,
    completedGoodCount,
    completedIssueCount,
    averageRating: ratingAgg._avg.score,
    ratingCount: ratingAgg._count.score,
    ...dimensionValues,
    dimensionCount,
    repeatPartnerCount,
    medianResponseMinutes: responseMinutes,
  };

  await db.reputation.upsert({
    where: { partyId },
    create: { partyId, ...values },
    update: values,
  });
}

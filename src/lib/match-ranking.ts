import "server-only";
import { prisma } from "@/lib/prisma";
import { scoreMatch } from "@/lib/matching-core";
import { resolveMatchSides } from "@/lib/match-view";
import { reliabilityByKind, tallyReasonOutcomes, type ReasonReliability } from "@/lib/reason-reliability";
import type { RankableMatch } from "@/lib/match-rank";
import type { Party, Post, Reputation, TransactionConfirmation } from "@/generated/prisma/client";

// The server-side seam between the pure ranking modules and Prisma: pages
// call these two, and never have to know that ranking is assembled from
// three separate pure functions.

// Enough settled matches to be a real sample, bounded so this stays one
// cheap query rather than a full-table scan as the network grows. Newest
// first, so what the tally reflects is how the reasons are performing now.
const RELIABILITY_SAMPLE_SIZE = 5000;

// How every cited reason has actually performed across the whole network —
// not per party. A single farmer will never settle enough matches to say
// anything about whether "on your route" predicts a trade; the network will.
//
// Derived on read from `Match.reasons` and `Match.status`, which have been
// accumulating since launch. No rollup table until this query stops being
// cheap, and no migration to start using it.
export async function loadReasonReliability(): Promise<ReasonReliability> {
  const settled = await prisma.match.findMany({
    where: { status: { in: ["ACCEPTED", "DECLINED", "COMPLETED"] } },
    select: {
      reasons: true,
      status: true,
      confirmations: { select: { outcome: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: RELIABILITY_SAMPLE_SIZE,
  });

  return reliabilityByKind(
    tallyReasonOutcomes(
      settled.map((m) => ({
        reasons: m.reasons,
        status: m.status,
        // Either side reporting the trade never happened is evidence
        // against the reasons that paired them, however the match row is
        // labelled.
        fellThrough: m.confirmations.some((c) => c.outcome === "DID_NOT_HAPPEN"),
      })),
    ),
  );
}

type PostWithParty = Post & { party: Party & { reputation: Reputation | null } };

// Rebuilds a match's evidence against today's posts and today's reputation,
// rather than reading back the score frozen into the row when the match was
// first written. This is the whole point: nothing about the stored row
// changes, but a counterparty who completed three trades this week now
// scores like it.
export function toRankableMatch<
  M extends {
    id: string;
    status: RankableMatch["status"];
    createdAt: Date;
    postA: PostWithParty;
    postB: PostWithParty;
    confirmations?: Pick<TransactionConfirmation, "partyId">[];
  },
>(
  match: M,
  partyId: string,
  strengthByCounterparty?: Map<string, number>,
): RankableMatch & { source: M } {
  const { yours, theirs } = resolveMatchSides<PostWithParty>(match, partyId);
  const { signals } = scoreMatch(theirs, yours, theirs.party.reputation, theirs.party.verifiedBy);

  return {
    id: match.id,
    status: match.status,
    createdAt: match.createdAt,
    signals,
    yours,
    theirs,
    counterpartyReputation: theirs.party.reputation,
    counterpartyVerifiedBy: theirs.party.verifiedBy,
    relationStrength: strengthByCounterparty?.get(theirs.party.id),
    awaitingCounterparty: match.confirmations?.some((c) => c.partyId === partyId) ?? false,
    source: match,
  };
}

import "server-only";
import { prisma } from "@/lib/prisma";
import { scoreMatch } from "@/lib/matching-core";
import { resolveMatchSides } from "@/lib/match-view";
import {
  reliabilityByKind,
  tallyReasonOutcomes,
  type ReasonReliability,
} from "@/lib/reason-reliability";
import {
  counterpartyClassOf,
  laneHistory,
  laneKey,
  outcomeOf,
  summarizeTradeOutcomes,
  weakerClass,
  type LaneHistory,
  type TradeRecord,
} from "@/lib/trade-outcomes";
import type { RankableMatch } from "@/lib/match-rank";
import type { Party, Post, Reputation, TransactionConfirmation } from "@/generated/prisma/client";

// The server-side seam between the pure ranking modules and Prisma: pages
// call these, and never have to know that ranking is assembled from four
// separate pure functions.

// Enough settled matches to be a real sample, bounded so this stays one
// cheap query rather than a full-table scan as the network grows. Newest
// first, so what it reflects is how matching is performing now.
const HISTORY_SAMPLE_SIZE = 5000;

// Everything FarmaTrade has learned from its own settled matches. Two
// different readings of one scan:
//
//   reliability — per reason kind, does citing this predict a trade
//   lanes       — per category and route, do trades like this hold up
//
// Both are network-wide rather than per party, and deliberately so. A single
// farmer will never settle enough matches to say whether "on your route"
// means anything; the network will. Both are derived on read from columns
// that have been filling up since launch, so neither needed a migration to
// start working.
export type MatchingHistory = {
  reliability: ReasonReliability;
  lanes: LaneHistory;
};

export async function loadMatchingHistory(): Promise<MatchingHistory> {
  const settled = await prisma.match.findMany({
    where: { status: { in: ["ACCEPTED", "DECLINED", "COMPLETED"] } },
    select: {
      reasons: true,
      status: true,
      confirmations: { select: { outcome: true } },
      postA: {
        select: {
          category: true,
          district: true,
          party: {
            select: {
              verifiedBy: true,
              reputation: { select: { completedCount: true, ratingCount: true } },
            },
          },
        },
      },
      postB: {
        select: {
          category: true,
          district: true,
          party: {
            select: {
              verifiedBy: true,
              reputation: { select: { completedCount: true, ratingCount: true } },
            },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: HISTORY_SAMPLE_SIZE,
  });

  const reliability = reliabilityByKind(
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

  const records: TradeRecord[] = settled.map((m) => {
    const { lane, laneLabel } = laneKey(m.postA.category, m.postA.district, m.postB.district);
    return {
      lane,
      laneLabel,
      counterpartyClass: weakerClass(
        counterpartyClassOf(m.postA.party.reputation, m.postA.party.verifiedBy),
        counterpartyClassOf(m.postB.party.reputation, m.postB.party.verifiedBy),
      ),
      outcome: outcomeOf(m.status, m.confirmations),
    };
  });

  return { reliability, lanes: laneHistory(summarizeTradeOutcomes(records)) };
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

  const { lane } = laneKey(yours.category, yours.district, theirs.district);

  return {
    id: match.id,
    status: match.status,
    createdAt: match.createdAt,
    signals,
    yours,
    theirs,
    counterpartyReputation: theirs.party.reputation,
    counterpartyVerifiedBy: theirs.party.verifiedBy,
    lane,
    // Looked up the same way it was recorded — on the least-established
    // side — so a brief is read off the sample it actually belongs to.
    laneClass: weakerClass(
      counterpartyClassOf(yours.party.reputation, yours.party.verifiedBy),
      counterpartyClassOf(theirs.party.reputation, theirs.party.verifiedBy),
    ),
    relationStrength: strengthByCounterparty?.get(theirs.party.id),
    awaitingCounterparty: match.confirmations?.some((c) => c.partyId === partyId) ?? false,
    source: match,
  };
}

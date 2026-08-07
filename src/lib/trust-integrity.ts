// Where a reputation came from, not just how big it is.
//
// The attack this closes is the cheapest one against any ratings system:
// make two accounts, trade with yourself, confirm both sides, rate each
// other five stars, repeat. After a fortnight the ring outranks an honest
// farmer who has done twenty real trades, because the scoreboard only
// counted stars and completions and neither is expensive to manufacture.
//
// The tempting fix is a fraud detector — score the graph, flag the
// suspicious, suppress them. It's the wrong tool here. A smallholder who
// sells their entire crop to one loyal buyer every season looks *identical*
// to a collusion ring by every structural measure, and a false accusation
// against a real farmer costs far more than the fraud does. Any threshold
// that catches rings also catches them.
//
// So this measures provenance instead and never accuses anyone. "★4.9 from
// 14 trades with 1 partner" and "★4.7 from 14 trades with 11 partners" are
// both stated plainly, and a reader can see which is the stronger claim.
// That's honest and useful for the loyal-buyer farmer — and it happens to
// make the ring worthless, because the thing it manufactured is now
// displayed as exactly what it is. The defence is disclosure, not judgement.
//
// Pure and DB-free, same reasoning as the other -core files.

export type TradeCounterparty = { counterpartyId: string; completedTrades: number };

// Herfindahl index over counterparties: the sum of squared shares.
// 1.0 means every trade was with the same party; 1/n means they were spread
// perfectly evenly across n partners. Chosen over "count of distinct
// partners" because it's sensitive to *balance* — 9 trades with one buyer
// and 1 each with two others is far more concentrated than 11 spread three
// ways, and a plain count calls both "3 partners".
export function counterpartyConcentration(trades: TradeCounterparty[]): number {
  const total = trades.reduce((sum, t) => sum + t.completedTrades, 0);
  if (total === 0) return 0;
  return trades.reduce((sum, t) => sum + (t.completedTrades / total) ** 2, 0);
}

export type ReputationProvenance = {
  distinctPartners: number;
  totalTrades: number;
  concentration: number;
  // How much independent corroboration this reputation actually carries,
  // 0..1. Drives ordering and how confidently the number is displayed.
  breadth: number;
  // Plain language for the UI, always factual and never an allegation.
  label: string;
  // True when the reputation rests on so few relationships that showing a
  // bare star average would overstate it.
  narrow: boolean;
};

// Below this, a star average is one relationship's opinion wearing the
// costume of a market consensus.
export const MIN_PARTNERS_FOR_BROAD = 3;

export function reputationProvenance(trades: TradeCounterparty[]): ReputationProvenance {
  const distinctPartners = trades.filter((t) => t.completedTrades > 0).length;
  const totalTrades = trades.reduce((sum, t) => sum + t.completedTrades, 0);
  const concentration = counterpartyConcentration(trades);

  // Breadth rewards both "many partners" and "evenly spread". Either alone
  // is gameable: a ring can add sockpuppets to raise the partner count, but
  // the trades stay lopsided toward the accounts doing the real volume.
  const spread = 1 - concentration;
  const partnerFactor = Math.min(1, distinctPartners / 6);
  const breadth = totalTrades === 0 ? 0 : Math.round((spread * 0.6 + partnerFactor * 0.4) * 100) / 100;

  const narrow = totalTrades > 0 && distinctPartners < MIN_PARTNERS_FOR_BROAD;

  let label: string;
  if (totalTrades === 0) {
    label = "No completed trades yet";
  } else if (distinctPartners === 1) {
    label = `All ${totalTrades} trade${totalTrades === 1 ? "" : "s"} with the same partner`;
  } else if (narrow) {
    label = `${totalTrades} trades across ${distinctPartners} partners`;
  } else {
    label = `${totalTrades} trades across ${distinctPartners} different partners`;
  }

  return { distinctPartners, totalTrades, concentration, breadth, label, narrow };
}

// A closed pair: two parties whose completed trades are overwhelmingly with
// each other and almost nobody else. Reported as a neutral observation for
// an operator's review queue — deliberately not surfaced to users and never
// used to suppress an account automatically, because the loyal-buyer case
// is indistinguishable and a wrong call costs a real business.
export type ClosedPair = {
  partyA: string;
  partyB: string;
  sharedTrades: number;
  // The weaker of the two sides' dependency, so a pair only counts as
  // closed when *both* parties are inside it. A big buyer who happens to be
  // one smallholder's only customer is not a ring, and taking the max
  // instead of the min would flag every one of them.
  mutualDependency: number;
};

export const CLOSED_PAIR_THRESHOLD = 0.8;
export const CLOSED_PAIR_MIN_TRADES = 3;

export function findClosedPairs(
  partyTrades: Map<string, TradeCounterparty[]>,
): ClosedPair[] {
  const totals = new Map<string, number>();
  for (const [partyId, trades] of partyTrades) {
    totals.set(partyId, trades.reduce((sum, t) => sum + t.completedTrades, 0));
  }

  const seen = new Set<string>();
  const pairs: ClosedPair[] = [];

  for (const [partyId, trades] of partyTrades) {
    const partyTotal = totals.get(partyId) ?? 0;
    if (partyTotal === 0) continue;

    for (const trade of trades) {
      const key = [partyId, trade.counterpartyId].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);

      if (trade.completedTrades < CLOSED_PAIR_MIN_TRADES) continue;

      const otherTotal = totals.get(trade.counterpartyId);
      // Unknown counterparty: can't establish mutuality, so don't guess.
      if (!otherTotal) continue;

      const dependency = Math.min(
        trade.completedTrades / partyTotal,
        trade.completedTrades / otherTotal,
      );
      if (dependency < CLOSED_PAIR_THRESHOLD) continue;

      const [partyA, partyB] = [partyId, trade.counterpartyId].sort();
      pairs.push({
        partyA,
        partyB,
        sharedTrades: trade.completedTrades,
        mutualDependency: Math.round(dependency * 100) / 100,
      });
    }
  }

  return pairs.sort((a, b) => b.mutualDependency - a.mutualDependency);
}

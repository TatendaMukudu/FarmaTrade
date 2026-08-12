// Getting farmers to stamp their trades.
//
// Every learning signal FarmaTrade has runs through TransactionConfirmation:
// reason reliability, lane track records, reputation, and DID_NOT_HAPPEN all
// read from rows that both sides fill in voluntarily, after the fact, with
// nothing prompting them. The schema is candid that this is "a known,
// deliberate weak point."
//
// The failure mode isn't that farmers refuse. It's that a trade ends in a
// field or a WhatsApp thread, the app isn't open, and by the time it is the
// moment has passed. Nobody has a reason to come back and log it — least of
// all when it went badly, which is exactly the record worth the most.
//
// So this is not a nag counter. It escalates on the one thing that actually
// predicts a lost record — elapsed time since both sides agreed — and it
// stops asking when asking has stopped being reasonable, because an app that
// pesters forever gets ignored forever.
//
// Pure and DB-free.

// Long enough that a trade arranged today isn't chased this afternoon.
const DUE_AFTER_DAYS = 2;
// Past this, an unconfirmed trade is the thing standing between a farmer and
// a working reputation, and it leads the dashboard.
const OVERDUE_AFTER_DAYS = 7;
// Past this we stop escalating. The record is very likely lost, and the
// honest response is to keep it quietly available rather than to keep
// shouting about it.
const STALE_AFTER_DAYS = 45;

const DAY_MS = 24 * 60 * 60 * 1000;

export type StampUrgency = "waiting" | "due" | "overdue" | "stale";

export type StampablePrompt = {
  matchId: string;
  counterpartyName: string;
  title: string;
  agreedAt: Date;
  ageDays: number;
  urgency: StampUrgency;
  // True once the counterparty has filed their side and is waiting on this
  // farmer. A trade one side has already stamped is the cheapest record in
  // the system to complete, and the most wasteful to lose.
  counterpartyAlreadyStamped: boolean;
};

export type StampableMatch = {
  matchId: string;
  counterpartyName: string;
  title: string;
  // When the match was accepted — the moment both sides agreed to trade.
  agreedAt: Date;
  youStamped: boolean;
  counterpartyStamped: boolean;
};

function urgencyFor(ageDays: number, counterpartyStamped: boolean): StampUrgency {
  if (ageDays >= STALE_AFTER_DAYS) return "stale";
  // A counterparty who has already filed theirs moves this up a step: they
  // have done their part, and the trade is one tap from being on the record.
  if (ageDays >= OVERDUE_AFTER_DAYS || (counterpartyStamped && ageDays >= DUE_AFTER_DAYS)) {
    return "overdue";
  }
  if (ageDays >= DUE_AFTER_DAYS || counterpartyStamped) return "due";
  return "waiting";
}

const URGENCY_ORDER: Record<StampUrgency, number> = {
  overdue: 0,
  due: 1,
  waiting: 2,
  stale: 3,
};

// What this farmer still owes the record, most pressing first.
export function pendingStamps(matches: StampableMatch[], now: Date): StampablePrompt[] {
  return matches
    .filter((m) => !m.youStamped)
    .map((m) => {
      const ageDays = Math.floor((now.getTime() - m.agreedAt.getTime()) / DAY_MS);
      return {
        matchId: m.matchId,
        counterpartyName: m.counterpartyName,
        title: m.title,
        agreedAt: m.agreedAt,
        ageDays,
        urgency: urgencyFor(ageDays, m.counterpartyStamped),
        counterpartyAlreadyStamped: m.counterpartyStamped,
      };
    })
    .sort(
      (a, b) =>
        URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] ||
        b.ageDays - a.ageDays ||
        a.matchId.localeCompare(b.matchId),
    );
}

// Only what is worth interrupting a farmer for. Stale prompts stay reachable
// on the Opportunities page but are deliberately absent here.
export function promptsWorthSurfacing(prompts: StampablePrompt[]): StampablePrompt[] {
  return prompts.filter((p) => p.urgency === "due" || p.urgency === "overdue");
}

export type StampBanner = {
  headline: string;
  // Why this matters to the farmer being asked, in their terms. Not
  // "help us improve matching" — that is our problem, not theirs.
  reason: string;
  tone: "warning" | "info";
  count: number;
};

// The dashboard banner, or null when there is nothing fair to ask for.
//
// The reason line is the part that matters. A farmer has no stake in our
// data quality, but they have a direct stake in their own track record —
// it is what a stranger reads before deciding to trade with them, and it
// stays empty until they stamp something.
export function stampBanner(prompts: StampablePrompt[]): StampBanner | null {
  const worth = promptsWorthSurfacing(prompts);
  if (worth.length === 0) return null;

  const overdue = worth.filter((p) => p.urgency === "overdue");
  const waitingOnYou = worth.filter((p) => p.counterpartyAlreadyStamped);

  if (waitingOnYou.length > 0) {
    const name = waitingOnYou[0].counterpartyName;
    return {
      headline:
        waitingOnYou.length === 1
          ? `${name} has confirmed your trade — your side is missing`
          : `${waitingOnYou.length} counterparties have confirmed — your side is missing`,
      reason:
        "Until both sides confirm, the trade doesn't count towards either of your records.",
      tone: "warning",
      count: waitingOnYou.length,
    };
  }

  if (overdue.length > 0) {
    return {
      headline: `${overdue.length} trade${overdue.length === 1 ? "" : "s"} still unconfirmed`,
      reason:
        "Confirming is what builds your track record — it's the first thing a buyer or seller looks at.",
      tone: "warning",
      count: overdue.length,
    };
  }

  return {
    headline: `Did ${worth.length === 1 ? "this trade" : `these ${worth.length} trades`} go ahead?`,
    reason:
      "A quick yes or no builds your track record, and tells us not to keep suggesting what doesn't work.",
    tone: "info",
    count: worth.length,
  };
}

// How this farmer is doing at keeping their own record straight. Shown on
// their profile as an honest number rather than a scolding.
export function stampingRate(
  settledMatches: number,
  stampedMatches: number,
): { rate: number | null; line: string } {
  if (settledMatches === 0) {
    return { rate: null, line: "No trades to confirm yet." };
  }
  const rate = Math.round((stampedMatches / settledMatches) * 100);
  return {
    rate,
    line: `You've confirmed ${stampedMatches} of ${settledMatches} agreed trades.`,
  };
}

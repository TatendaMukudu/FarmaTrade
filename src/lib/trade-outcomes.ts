// What actually happened, last time a trade like this one was matched.
//
// Every reason FarmaTrade cites today is a claim about *attributes* — this
// counterparty is nearby, this counterparty is rated, this post is urgent.
// None of them is a claim about history: nothing tells a farmer that produce
// moving Marondera-to-Harare has been matched eleven times and fell through
// on seven of them, or that on this route the trades that held were the ones
// with a counterparty who already had a track record.
//
// That is a different and more useful kind of evidence, and FarmaTrade has
// been recording it since launch without reading it back: Match.status says
// whether a pairing was taken up, TransactionConfirmation.outcome says
// whether it survived contact with reality, and Intent.category/district say
// what kind of trade it was.
//
// Two deliberate limits, both of which the rest of this file enforces rather
// than merely intends:
//
//   - It summarizes, it never predicts. "5 of 7 completed" is a count. "This
//     will probably work out" is a forecast, and FarmaTrade has no basis for
//     one. `assertSafeReasonText` is what stops the second sentence being
//     written, and it runs over every line this module produces.
//   - It never claims cause. A lane where trades fall through is a lane
//     where trades fell through — not a lane that *causes* them to. Every
//     summary carries `not_causal` in its limitations for exactly as long as
//     that stays true, which is forever without a controlled comparison.
//
// Pure and DB-free, so the honesty rules above are unit-testable. The
// server-side wrapper that feeds it lives in match-ranking.ts.

import type { ConfirmationOutcome, MatchStatus, CommerceCategory } from "@/generated/prisma/client";

// At or below this many recorded trades, a lane's numbers are reported with
// an explicit small_sample caveat. Three is not a track record; it is three
// things that happened.
export const SMALL_SAMPLE = 3;

// A lane needs at least this much history before it is worth showing a
// farmer at all. Below it we have an anecdote, and dressing an anecdote up
// as evidence is worse than staying quiet.
export const MIN_LANE_HISTORY = 4;

export type TradeOutcome =
  | "completed_good"
  | "completed_issue"
  | "did_not_happen"
  | "declined"
  | "unclear";

// How much was known about the *least established* side of a trade — the one
// thing a farmer can actually act on when a lane looks risky. "Be careful
// with strangers on this route" is advice a farmer can use; "this route is
// bad" is not.
//
// Recorded from the weaker side deliberately. A network-wide history has no
// fixed "counterparty" — both parties are somebody's counterparty — and a
// trade is only as well-evidenced as the side you know least about.
export type CounterpartyClass = "verified" | "rated" | "building" | "new";

const CLASS_STRENGTH: Record<CounterpartyClass, number> = {
  new: 0,
  building: 1,
  rated: 2,
  verified: 3,
};

export const COUNTERPARTY_CLASS_LABEL: Record<CounterpartyClass, string> = {
  verified: "Where both sides were vouched for",
  rated: "Where both sides had ratings",
  building: "Where the least-established side was still building history",
  new: "Where one side had no history yet",
};

export function weakerClass(a: CounterpartyClass, b: CounterpartyClass): CounterpartyClass {
  return CLASS_STRENGTH[a] <= CLASS_STRENGTH[b] ? a : b;
}

export type TradeRecord = {
  lane: string;
  laneLabel: string;
  counterpartyClass: CounterpartyClass;
  outcome: TradeOutcome;
};

export type OutcomeCounts = {
  completed_good: number;
  completed_issue: number;
  did_not_happen: number;
  declined: number;
  unclear: number;
};

export type ClassSummary = {
  counterpartyClass: CounterpartyClass;
  total: number;
  counts: OutcomeCounts;
  held: number;
  // Percentage of recorded trades that completed, or null when there is
  // nothing to divide by. Never quoted below MIN_LANE_HISTORY.
  heldRate: number | null;
  limitations: string[];
  line: string;
};

export type LaneSummary = {
  lane: string;
  laneLabel: string;
  total: number;
  counts: OutcomeCounts;
  held: number;
  heldRate: number | null;
  byClass: ClassSummary[];
  limitations: string[];
  line: string;
};

function emptyCounts(): OutcomeCounts {
  return { completed_good: 0, completed_issue: 0, did_not_happen: 0, declined: 0, unclear: 0 };
}

function rate(part: number, total: number): number | null {
  return total ? Math.round((part / total) * 100) : null;
}

// Sorted, so a Marondera-to-Harare match and a Harare-to-Marondera one are
// the same lane. Direction matters to a transporter, but splitting the lane
// on it would halve an already-thin sample, and what this module answers —
// "do trades like this hold up" — is not directional.
export function laneKey(
  category: CommerceCategory,
  districtA: string,
  districtB: string,
): { lane: string; laneLabel: string } {
  const [first, second] = [districtA, districtB].sort((a, b) => a.localeCompare(b));
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const categoryLabel = category.charAt(0) + category.slice(1).toLowerCase();
  return {
    lane: `${category.toLowerCase()}:${norm(first)}~${norm(second)}`,
    laneLabel:
      first === second
        ? `${categoryLabel} within ${first}`
        : `${categoryLabel} between ${first} and ${second}`,
  };
}

export function counterpartyClassOf(
  reputation: { completedCount: number; ratingCount: number } | null,
  verifiedBy: string | null,
): CounterpartyClass {
  if (verifiedBy) return "verified";
  if ((reputation?.ratingCount ?? 0) >= 3) return "rated";
  if ((reputation?.completedCount ?? 0) > 0) return "building";
  return "new";
}

// What a settled match is evidence of. A match both sides accepted and then
// never traded on is `did_not_happen`, not a completion — that distinction is
// the whole reason this module can say anything a status column can't.
export function outcomeOf(
  status: MatchStatus,
  confirmations: { outcome: ConfirmationOutcome }[],
): TradeOutcome {
  if (confirmations.some((c) => c.outcome === "DID_NOT_HAPPEN")) return "did_not_happen";
  if (confirmations.some((c) => c.outcome === "COMPLETED_ISSUE")) return "completed_issue";
  if (confirmations.some((c) => c.outcome === "COMPLETED_GOOD")) return "completed_good";
  if (status === "DECLINED") return "declined";
  // Accepted, nobody has filed anything: genuinely not known yet, and
  // counting it either way would flatter or damn the lane on silence.
  return "unclear";
}

// A trade "held" if both sides came away with goods moved. An issue still
// counts — a late delivery is a completed trade with a complaint, and
// pretending otherwise would make every lane look worse than it is.
function heldCount(counts: OutcomeCounts): number {
  return counts.completed_good + counts.completed_issue;
}

function limitationsFor(counts: OutcomeCounts, total: number): string[] {
  // Always present, and not removable by volume: this is recorded history,
  // never a demonstrated cause.
  const limitations = ["not_causal"];
  if (total <= SMALL_SAMPLE) limitations.push("small_sample");
  if (counts.unclear > 0) limitations.push("outcome_still_unclear");
  return limitations;
}

export function outcomeLine(subject: string, counts: OutcomeCounts, total: number): string {
  if (!total) return `No recorded history for ${subject} yet.`;
  const parts: string[] = [];
  if (counts.completed_good) parts.push(`${counts.completed_good} completed well`);
  if (counts.completed_issue) parts.push(`${counts.completed_issue} completed with an issue`);
  if (counts.did_not_happen) parts.push(`${counts.did_not_happen} did not happen`);
  if (counts.declined) parts.push(`${counts.declined} declined`);
  if (counts.unclear) parts.push(`${counts.unclear} still open`);
  return `${subject}: ${total} recorded — ${parts.join(", ")}.`;
}

// Rolls recorded trades up by lane, and within each lane by what was known
// about the counterparty. Sorted by volume so the lanes a farmer trades most
// come first.
export function summarizeTradeOutcomes(records: TradeRecord[]): LaneSummary[] {
  const lanes = new Map<
    string,
    { laneLabel: string; counts: OutcomeCounts; byClass: Map<CounterpartyClass, OutcomeCounts> }
  >();

  for (const record of records) {
    const lane = lanes.get(record.lane) ?? {
      laneLabel: record.laneLabel,
      counts: emptyCounts(),
      byClass: new Map<CounterpartyClass, OutcomeCounts>(),
    };
    lane.counts[record.outcome] += 1;
    const classCounts = lane.byClass.get(record.counterpartyClass) ?? emptyCounts();
    classCounts[record.outcome] += 1;
    lane.byClass.set(record.counterpartyClass, classCounts);
    lanes.set(record.lane, lane);
  }

  return [...lanes.entries()]
    .map(([lane, data]) => {
      const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
      const held = heldCount(data.counts);
      const byClass: ClassSummary[] = [...data.byClass.entries()]
        .map(([counterpartyClass, counts]) => {
          const classTotal = Object.values(counts).reduce((a, b) => a + b, 0);
          const classHeld = heldCount(counts);
          return {
            counterpartyClass,
            total: classTotal,
            counts,
            held: classHeld,
            heldRate: classTotal >= MIN_LANE_HISTORY ? rate(classHeld, classTotal) : null,
            limitations: limitationsFor(counts, classTotal),
            line: outcomeLine(COUNTERPARTY_CLASS_LABEL[counterpartyClass], counts, classTotal),
          };
        })
        .sort((a, b) => b.total - a.total || a.counterpartyClass.localeCompare(b.counterpartyClass));

      return {
        lane,
        laneLabel: data.laneLabel,
        total,
        counts: data.counts,
        held,
        heldRate: total >= MIN_LANE_HISTORY ? rate(held, total) : null,
        byClass,
        limitations: limitationsFor(data.counts, total),
        line: outcomeLine(data.laneLabel, data.counts, total),
      };
    })
    .sort((a, b) => b.total - a.total || a.lane.localeCompare(b.lane));
}

export type LaneHistory = Map<string, LaneSummary>;

export function laneHistory(summaries: LaneSummary[]): LaneHistory {
  return new Map(summaries.map((s) => [s.lane, s]));
}

export type LaneBrief = {
  lane: string;
  // The sentence to show. Null when there isn't enough history to say
  // anything — an honest silence, not a hedge.
  line: string | null;
  // The narrower sentence about counterparties like this one, when that
  // sample is itself big enough to stand on.
  classLine: string | null;
  limitations: string[];
  // True when this lane's recorded trades mostly did not hold. Ranking reads
  // this; it is not a prediction about *this* match, it is a fact about the
  // ones already recorded.
  mostlyFellThrough: boolean;
};

// What can honestly be said about a specific pairing, given the lane it sits
// on and what is known about the counterparty. Returns nulls rather than
// softened guesses when the history isn't there.
export function laneBrief(
  history: LaneHistory,
  lane: string,
  counterpartyClass: CounterpartyClass,
): LaneBrief {
  const summary = history.get(lane);
  if (!summary || summary.total < MIN_LANE_HISTORY) {
    return {
      lane,
      line: null,
      classLine: null,
      limitations: ["not_causal", "no_lane_history"],
      mostlyFellThrough: false,
    };
  }

  const classSummary = summary.byClass.find((c) => c.counterpartyClass === counterpartyClass);
  const classLine =
    classSummary && classSummary.total >= MIN_LANE_HISTORY ? classSummary.line : null;

  // Judged on the settled trades only. A lane with four open matches and one
  // failure has not "mostly fallen through"; it has mostly not concluded.
  const settled = summary.total - summary.counts.unclear;
  const mostlyFellThrough = settled >= MIN_LANE_HISTORY && summary.held / settled < 0.5;

  return {
    lane,
    line: summary.line,
    classLine,
    limitations: summary.limitations,
    mostlyFellThrough,
  };
}

// The guard that keeps every sentence above a report rather than a forecast.
//
// FarmaTrade's schema already promises this — Match.reasons is documented as
// evidence a projection layer renders "instead of inventing a justification"
// — but nothing enforced it. A future WhatsApp phrasing layer turning
// "counterparty: 3 completed, 4.7 stars" into "a buyer who always pays on
// time" would have been a code review catch at best. Now it is a test
// failure.
//
// The banned words are the ones that turn a count into a claim: a promise
// about the future, or an assertion of cause.
const UNSAFE_LANGUAGE =
  /\b(will|guarantee[ds]?|predicts?|predicted|forecast|diagnos\w*|caused?|because|certain|guaranteed|always|never fails?|likely to|should expect)\b/i;

export function assertSafeReasonText(text: string): { ok: boolean; violations: string[] } {
  const match = UNSAFE_LANGUAGE.exec(String(text ?? ""));
  return match
    ? { ok: false, violations: [`predictive_or_causal_language: "${match[0]}"`] }
    : { ok: true, violations: [] };
}

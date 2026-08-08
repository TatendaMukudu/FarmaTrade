import { describe, expect, it } from "vitest";
import {
  bucketOf,
  confidenceOf,
  planMatches,
  priorityOf,
  rankMatches,
  rankOne,
  type RankableMatch,
} from "./match-rank";
import { reliabilityByKind, tallyReasonOutcomes } from "./reason-reliability";
import type { MatchSignal } from "./matching-core";

const NOW = new Date("2026-08-08T09:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * DAY);
}

function post(overrides: Partial<RankableMatch["yours"]> = {}): RankableMatch["yours"] {
  return { id: "post-1", urgent: false, neededBy: null, expiresAt: null, recurring: false, ...overrides };
}

function signal(overrides: Partial<MatchSignal> = {}): MatchSignal {
  return { kind: "same_district", points: 20, reason: "same district", ...overrides };
}

function match(overrides: Partial<RankableMatch> = {}): RankableMatch {
  return {
    id: "match-1",
    status: "SUGGESTED",
    createdAt: NOW,
    signals: [signal()],
    yours: post({ id: "yours" }),
    theirs: post({ id: "theirs" }),
    counterpartyReputation: null,
    counterpartyVerifiedBy: null,
    ...overrides,
  };
}

describe("priorityOf", () => {
  it("treats an urgent flag on either side as urgent", () => {
    expect(priorityOf(match({ theirs: post({ urgent: true }) }), NOW)).toBe("urgent");
    expect(priorityOf(match({ yours: post({ urgent: true }) }), NOW)).toBe("urgent");
  });

  it("reads neededBy — a field the stored score has never looked at", () => {
    expect(priorityOf(match({ yours: post({ neededBy: daysFromNow(2) }) }), NOW)).toBe("urgent");
    expect(priorityOf(match({ yours: post({ neededBy: daysFromNow(10) }) }), NOW)).toBe("high");
    expect(priorityOf(match({ yours: post({ neededBy: daysFromNow(60) }) }), NOW)).toBe("medium");
  });

  it("keeps a passed deadline urgent instead of quietly demoting it", () => {
    expect(priorityOf(match({ yours: post({ neededBy: daysFromNow(-4) }) }), NOW)).toBe("urgent");
  });

  it("takes the soonest deadline across both sides", () => {
    const m = match({
      yours: post({ neededBy: daysFromNow(30) }),
      theirs: post({ neededBy: daysFromNow(1) }),
    });
    expect(priorityOf(m, NOW)).toBe("urgent");
  });

  it("treats an accepted match as a live obligation", () => {
    expect(priorityOf(match({ status: "ACCEPTED" }), NOW)).toBe("high");
  });

  it("drops an unanswered suggestion to low once it has stopped being news", () => {
    expect(priorityOf(match({ createdAt: daysFromNow(-60) }), NOW)).toBe("low");
  });

  it("lifts a preferred partner above an ordinary suggestion", () => {
    expect(priorityOf(match({ relationStrength: 3 }), NOW)).toBe("high");
    expect(priorityOf(match({ relationStrength: 1 }), NOW)).toBe("medium");
  });
});

describe("confidenceOf", () => {
  it("grades on how much is actually known about the counterparty", () => {
    expect(confidenceOf(match({ counterpartyReputation: { completedCount: 5, ratingCount: 4 } }))).toBe(
      "confirmed",
    );
    expect(confidenceOf(match({ counterpartyReputation: { completedCount: 1, ratingCount: 0 } }))).toBe(
      "reliable",
    );
    expect(confidenceOf(match({ counterpartyVerifiedBy: "FOUNDER" }))).toBe("promising");
    expect(confidenceOf(match())).toBe("calibrating");
  });

  it("lets learned reliability lower a confidence but never raise one", () => {
    const stoodDown = reliabilityByKind(
      tallyReasonOutcomes(
        Array.from({ length: 10 }, () => ({ reasons: ["same district"], status: "DECLINED" as const })),
      ),
    );
    const proven = reliabilityByKind(
      tallyReasonOutcomes(
        Array.from({ length: 10 }, () => ({ reasons: ["same district"], status: "ACCEPTED" as const })),
      ),
    );
    const m = match({ counterpartyReputation: { completedCount: 5, ratingCount: 4 } });
    expect(confidenceOf(m, stoodDown)).toBe("reliable");
    expect(confidenceOf(m, proven)).toBe("confirmed");
  });
});

describe("bucketOf", () => {
  it("routes by what the farmer has to do about it", () => {
    expect(bucketOf(match({ theirs: post({ urgent: true }) }), "urgent", NOW)).toBe("time_critical");
    expect(bucketOf(match({ status: "ACCEPTED" }), "high", NOW)).toBe("in_progress");
    expect(bucketOf(match(), "medium", NOW)).toBe("needs_response");
    expect(bucketOf(match({ createdAt: daysFromNow(-60) }), "low", NOW)).toBe("worth_knowing");
  });
});

describe("rankOne", () => {
  it("reproduces the stored score exactly when nothing has been learned", () => {
    // 50 base + 20 same district — identical to what scoreMatch wrote.
    expect(rankOne(match(), { now: NOW }).evidenceScore).toBe(70);
  });

  it("moves the evidence score when the counterparty's history changes, with no rewrite", () => {
    const richer = match({
      signals: [signal(), signal({ kind: "counterparty_building", points: 8, reason: "counterparty: 8 completed (still building rating history)" })],
    });
    expect(rankOne(richer, { now: NOW }).evidenceScore).toBeGreaterThan(
      rankOne(match(), { now: NOW }).evidenceScore,
    );
  });

  it("re-prices a reason that history says has not panned out", () => {
    const stoodDown = reliabilityByKind(
      tallyReasonOutcomes(
        Array.from({ length: 10 }, () => ({ reasons: ["same district"], status: "DECLINED" as const })),
      ),
    );
    const plain = rankOne(match(), { now: NOW });
    const learned = rankOne(match(), { now: NOW, reliability: stoodDown });
    expect(learned.evidenceScore).toBeLessThan(plain.evidenceScore);
    expect(learned.rationale).toContain("reason:same_district:hasn't panned out so far");
  });

  it("flags the limitations behind a thin match rather than hiding them in a number", () => {
    expect(rankOne(match(), { now: NOW }).limitations).toContain("no_outcome_history");
    expect(
      rankOne(match({ counterpartyReputation: { completedCount: 4, ratingCount: 1 } }), { now: NOW })
        .limitations,
    ).toContain("small_sample");
  });

  it("uses DID_NOT_HAPPEN, which the reputation aggregate used to discard", () => {
    const fellThrough = match({
      counterpartyReputation: { completedCount: 4, ratingCount: 4, didNotHappenCount: 2 },
    });
    const clean = match({ counterpartyReputation: { completedCount: 4, ratingCount: 4 } });
    expect(rankOne(fellThrough, { now: NOW }).limitations).toContain("counterparty_fell_through");
    expect(rankOne(fellThrough, { now: NOW }).rank).toBeLessThan(rankOne(clean, { now: NOW }).rank);
  });

  it("decays an unanswered suggestion but never an accepted one", () => {
    const stale = { createdAt: daysFromNow(-30) };
    expect(rankOne(match(stale), { now: NOW }).rank).toBeLessThan(rankOne(match(), { now: NOW }).rank);
    expect(rankOne(match({ ...stale, status: "ACCEPTED" }), { now: NOW }).rank).toBe(
      rankOne(match({ status: "ACCEPTED" }), { now: NOW }).rank,
    );
  });

  it("shows its working", () => {
    const ranked = rankOne(match({ relationStrength: 3, theirs: post({ recurring: true }) }), {
      now: NOW,
    });
    expect(ranked.rationale).toEqual(
      expect.arrayContaining([
        "priority:high",
        "confidence:calibrating",
        "limitation:no_outcome_history",
        "preferred_partner",
        "standing_order",
      ]),
    );
  });
});

describe("rankMatches", () => {
  it("puts a deadline above a better-evidenced but routine match", () => {
    const urgent = match({ id: "a", theirs: post({ neededBy: daysFromNow(1) }) });
    const wellEvidenced = match({
      id: "b",
      counterpartyReputation: { completedCount: 20, ratingCount: 15 },
      signals: [signal(), signal({ kind: "counterparty_rated", points: 20, reason: "counterparty: 20 completed, 5.0★ (15 ratings)" })],
    });
    expect(rankMatches([wellEvidenced, urgent], { now: NOW })[0].match.id).toBe("a");
  });

  it("lets evidence break a tie between two matches of equal urgency", () => {
    const thin = match({ id: "a" });
    const evidenced = match({
      id: "b",
      counterpartyReputation: { completedCount: 20, ratingCount: 15 },
      signals: [signal(), signal({ kind: "counterparty_rated", points: 20, reason: "counterparty: 20 completed, 5.0★ (15 ratings)" })],
    });
    expect(rankMatches([thin, evidenced], { now: NOW })[0].match.id).toBe("b");
  });

  it("is stable for genuinely equal matches rather than however the DB returned them", () => {
    const a = match({ id: "aaa" });
    const b = match({ id: "bbb" });
    expect(rankMatches([b, a], { now: NOW }).map((r) => r.match.id)).toEqual(["aaa", "bbb"]);
    expect(rankMatches([a, b], { now: NOW }).map((r) => r.match.id)).toEqual(["aaa", "bbb"]);
  });

  it("recomputes on every read — the same rows rank differently as time passes", () => {
    const soon = match({ id: "a", yours: post({ neededBy: daysFromNow(10) }) });
    expect(rankOne(soon, { now: NOW }).priority).toBe("high");
    expect(rankOne(soon, { now: daysFromNow(8) }).priority).toBe("urgent");
  });
});

describe("planMatches", () => {
  it("caps each section and says how many were held back", () => {
    const many = Array.from({ length: 9 }, (_, i) => match({ id: `m-${i}` }));
    const plan = planMatches(many, { now: NOW, limit: 5 });
    const needsResponse = plan.groups.find((g) => g.bucket === "needs_response")!;
    expect(needsResponse.matches).toHaveLength(5);
    expect(needsResponse.hidden).toBe(4);
  });

  it("honours a per-bucket cap", () => {
    const stale = Array.from({ length: 6 }, (_, i) => match({ id: `m-${i}`, createdAt: daysFromNow(-60) }));
    const plan = planMatches(stale, { now: NOW, limit: { worth_knowing: 2 } });
    expect(plan.groups.find((g) => g.bucket === "worth_knowing")!.matches).toHaveLength(2);
  });

  it("gives an empty section its own honest line instead of a blank space", () => {
    const plan = planMatches([match()], { now: NOW });
    const timeCritical = plan.groups.find((g) => g.bucket === "time_critical")!;
    expect(timeCritical.empty).toBe(true);
    expect(timeCritical.message).toBe("Nothing time-critical right now.");
    expect(plan.empty).toBe(false);
  });

  it("distinguishes 'nothing urgent' from 'nothing at all'", () => {
    const plan = planMatches([], { now: NOW });
    expect(plan.empty).toBe(true);
    expect(plan.message).toContain("No opportunities yet");
  });
});

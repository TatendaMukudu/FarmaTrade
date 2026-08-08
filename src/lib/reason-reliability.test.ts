import { describe, expect, it } from "vitest";
import {
  MIN_FEEDBACK,
  MIN_FEEDBACK_TO_STAND_DOWN,
  matchVote,
  reasonKind,
  reasonWeightMultiplier,
  reliability,
  reliabilityByKind,
  shouldTrust,
  tallyReasonOutcomes,
} from "./reason-reliability";
import type { MatchStatus } from "@/generated/prisma/client";

describe("reliability", () => {
  it("reports calibrating, with no score, below the feedback floor", () => {
    const rel = reliability({ useful: 3, dismiss: 0 });
    expect(rel.tier).toBe("calibrating");
    expect(rel.score).toBeNull();
    expect(rel.total).toBe(3);
    expect(rel.basis).toBe(`still calibrating (3/${MIN_FEEDBACK} responses)`);
  });

  it("treats a perfect but tiny run as calibrating rather than reliable", () => {
    expect(reliability({ useful: 3, dismiss: 0 }).tier).toBe("calibrating");
    expect(reliability({ useful: 4, dismiss: 0 }).tier).toBe("reliable");
  });

  it("grades reliable / promising / unproven once there is enough feedback", () => {
    expect(reliability({ useful: 7, dismiss: 3 }).tier).toBe("reliable");
    expect(reliability({ useful: 5, dismiss: 5 }).tier).toBe("promising");
    expect(reliability({ useful: 2, dismiss: 8 }).tier).toBe("unproven");
  });

  it("treats a missing tally as zero feedback, not as a bad one", () => {
    const rel = reliability(undefined);
    expect(rel.tier).toBe("calibrating");
    expect(rel.total).toBe(0);
  });
});

describe("shouldTrust", () => {
  it("keeps trusting a reason that is unproven on thin evidence", () => {
    const rel = reliability({ useful: 1, dismiss: 4 });
    expect(rel.tier).toBe("unproven");
    expect(rel.total).toBeLessThan(MIN_FEEDBACK_TO_STAND_DOWN);
    expect(shouldTrust(rel)).toBe(true);
  });

  it("stands a reason down only once it is unproven AND well evidenced", () => {
    expect(shouldTrust(reliability({ useful: 1, dismiss: 5 }))).toBe(false);
  });

  it("never stands down a reason that is merely calibrating", () => {
    expect(shouldTrust(reliability({ useful: 0, dismiss: 3 }))).toBe(true);
  });
});

describe("reasonWeightMultiplier", () => {
  it("leaves a calibrating reason priced exactly as it is today", () => {
    expect(reasonWeightMultiplier(reliability({ useful: 1, dismiss: 1 }))).toBe(1);
  });

  it("boosts a reason that has earned it and damps one that has not", () => {
    expect(reasonWeightMultiplier(reliability({ useful: 9, dismiss: 1 }))).toBeGreaterThan(1);
    expect(reasonWeightMultiplier(reliability({ useful: 1, dismiss: 9 }))).toBeLessThan(1);
  });

  it("never prices a reason at zero, even fully stood down", () => {
    expect(reasonWeightMultiplier(reliability({ useful: 0, dismiss: 20 }))).toBeGreaterThan(0);
  });
});

describe("reasonKind", () => {
  it("maps every reason scoreMatch writes back to a kind", () => {
    expect(reasonKind("same province")).toBe("same_province");
    expect(reasonKind("same district")).toBe("same_district");
    expect(reasonKind("on your route")).toBe("on_your_route");
    expect(reasonKind("founder-vouched")).toBe("founder_vouched");
    expect(reasonKind("network-referred")).toBe("network_referred");
    expect(reasonKind("time-sensitive")).toBe("time_sensitive");
    expect(reasonKind("counterparty: new, no history yet")).toBe("counterparty_new");
    expect(reasonKind("counterparty: 4 completed (still building rating history)")).toBe(
      "counterparty_building",
    );
    expect(reasonKind("counterparty: 12 completed, 4.7★ (9 ratings)")).toBe("counterparty_rated");
  });

  it("collapses the numbers baked into a reason so they form one sample", () => {
    expect(reasonKind("counterparty: 3 completed, 4.7★ (5 ratings)")).toBe(
      reasonKind("counterparty: 11 completed, 4.2★ (9 ratings)"),
    );
  });

  it("returns null for an unrecognized reason rather than guessing a bucket", () => {
    expect(reasonKind("something we have never written")).toBeNull();
  });
});

describe("matchVote", () => {
  it("counts acceptance and completion as useful, decline as a dismissal", () => {
    expect(matchVote({ status: "ACCEPTED" })).toBe("useful");
    expect(matchVote({ status: "COMPLETED" })).toBe("useful");
    expect(matchVote({ status: "DECLINED" })).toBe("dismiss");
  });

  it("does not count an unanswered suggestion as either", () => {
    expect(matchVote({ status: "SUGGESTED" })).toBeNull();
  });

  it("counts a trade that fell through against the reasons, despite the status", () => {
    expect(matchVote({ status: "COMPLETED", fellThrough: true })).toBe("dismiss");
  });
});

describe("tallyReasonOutcomes", () => {
  it("credits every cited reason with the match's outcome", () => {
    const tallies = tallyReasonOutcomes([
      { reasons: ["same district", "founder-vouched"], status: "ACCEPTED" },
      { reasons: ["same district"], status: "DECLINED" },
    ]);
    expect(tallies.get("same_district")).toEqual({ useful: 1, dismiss: 1 });
    expect(tallies.get("founder_vouched")).toEqual({ useful: 1, dismiss: 0 });
  });

  it("ignores unanswered suggestions, so speed of matching can't move the odds", () => {
    const tallies = tallyReasonOutcomes([
      { reasons: ["on your route"], status: "SUGGESTED" },
      { reasons: ["on your route"], status: "SUGGESTED" },
    ]);
    expect(tallies.get("on_your_route")).toBeUndefined();
  });

  it("counts a reason cited twice on one match once", () => {
    const tallies = tallyReasonOutcomes([
      { reasons: ["same district", "same district"], status: "ACCEPTED" },
    ]);
    expect(tallies.get("same_district")).toEqual({ useful: 1, dismiss: 0 });
  });

  it("reads a real signal out of history without any new column", () => {
    // Twelve matches cited "on your route"; ten were declined.
    const rows: { reasons: string[]; status: MatchStatus }[] = Array.from(
      { length: 12 },
      (_, i) => ({ reasons: ["on your route"], status: i < 10 ? "DECLINED" : "ACCEPTED" }),
    );
    const rel = reliabilityByKind(tallyReasonOutcomes(rows)).get("on_your_route")!;
    expect(rel.tier).toBe("unproven");
    expect(rel.basis).toBe("2/12 led somewhere");
    expect(shouldTrust(rel)).toBe(false);
  });
});

describe("reliabilityByKind", () => {
  it("reports every kind, so an uncited reason reads as calibrating not missing", () => {
    const byKind = reliabilityByKind(new Map());
    expect(byKind.get("same_district")!.tier).toBe("calibrating");
    expect(byKind.get("time_sensitive")!.total).toBe(0);
  });
});

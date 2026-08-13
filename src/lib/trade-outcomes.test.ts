import { describe, expect, it } from "vitest";
import {
  assertSafeReasonText,
  counterpartyClassOf,
  laneBrief,
  laneHistory,
  laneKey,
  MIN_LANE_HISTORY,
  outcomeLine,
  outcomeOf,
  summarizeTradeOutcomes,
  weakerClass,
  type CounterpartyClass,
  type TradeOutcome,
  type TradeRecord,
} from "./trade-outcomes";
import { scoreMatch } from "./matching-core";
import { BUCKET_EMPTY, BUCKET_LABEL, CALM_MESSAGE } from "./match-rank";
import type { Intent, Reputation } from "@/generated/prisma/client";

function record(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    lane: "produce:harare~marondera",
    laneLabel: "Produce between Harare and Marondera",
    counterpartyClass: "new",
    outcome: "completed_good",
    ...overrides,
  };
}

function records(n: number, overrides: Partial<TradeRecord> = {}): TradeRecord[] {
  return Array.from({ length: n }, () => record(overrides));
}

describe("laneKey", () => {
  it("treats a route as the same lane in both directions, so the sample isn't halved", () => {
    expect(laneKey("PRODUCE", "Marondera", "Harare").lane).toBe(
      laneKey("PRODUCE", "Harare", "Marondera").lane,
    );
  });

  it("keeps categories apart — maize and tractors are not the same trade", () => {
    expect(laneKey("PRODUCE", "Marondera", "Harare").lane).not.toBe(
      laneKey("EQUIPMENT", "Marondera", "Harare").lane,
    );
  });

  it("reads as a place a farmer recognizes", () => {
    expect(laneKey("PRODUCE", "Marondera", "Harare").laneLabel).toBe(
      "Produce between Harare and Marondera",
    );
    expect(laneKey("LIVESTOCK", "Gweru", "Gweru").laneLabel).toBe("Livestock within Gweru");
  });
});

describe("counterpartyClassOf / weakerClass", () => {
  it("grades on what is actually known", () => {
    expect(counterpartyClassOf(null, "FOUNDER")).toBe("verified");
    expect(counterpartyClassOf({ completedCount: 9, ratingCount: 5 }, null)).toBe("rated");
    expect(counterpartyClassOf({ completedCount: 2, ratingCount: 0 }, null)).toBe("building");
    expect(counterpartyClassOf(null, null)).toBe("new");
  });

  it("records a trade as only as well-evidenced as its least known side", () => {
    expect(weakerClass("verified", "new")).toBe("new");
    expect(weakerClass("rated", "building")).toBe("building");
    expect(weakerClass("rated", "rated")).toBe("rated");
  });
});

describe("outcomeOf", () => {
  it("counts a trade that never happened as exactly that, not as a completion", () => {
    expect(outcomeOf("COMPLETED", [{ outcome: "DID_NOT_HAPPEN" }])).toBe("did_not_happen");
  });

  it("lets one side's report of failure outweigh the other's completion", () => {
    expect(outcomeOf("COMPLETED", [{ outcome: "COMPLETED_GOOD" }, { outcome: "DID_NOT_HAPPEN" }])).toBe(
      "did_not_happen",
    );
  });

  it("reports an issue rather than rounding it up to a clean completion", () => {
    expect(outcomeOf("COMPLETED", [{ outcome: "COMPLETED_GOOD" }, { outcome: "COMPLETED_ISSUE" }])).toBe(
      "completed_issue",
    );
  });

  it("calls an accepted match with nothing filed unclear, not good or bad", () => {
    expect(outcomeOf("ACCEPTED", [])).toBe("unclear");
    expect(outcomeOf("DECLINED", [])).toBe("declined");
  });
});

describe("summarizeTradeOutcomes", () => {
  it("counts a lane's outcomes and splits them by how well known the sides were", () => {
    const summary = summarizeTradeOutcomes([
      ...records(3, { counterpartyClass: "rated", outcome: "completed_good" }),
      ...records(2, { counterpartyClass: "new", outcome: "did_not_happen" }),
    ])[0];

    expect(summary.total).toBe(5);
    expect(summary.counts.completed_good).toBe(3);
    expect(summary.counts.did_not_happen).toBe(2);
    expect(summary.byClass.map((c) => c.counterpartyClass)).toEqual(["rated", "new"]);
  });

  it("counts a completed-with-an-issue trade as one that held", () => {
    const summary = summarizeTradeOutcomes(records(5, { outcome: "completed_issue" }))[0];
    expect(summary.held).toBe(5);
    expect(summary.heldRate).toBe(100);
  });

  it("refuses to quote a percentage on a sample too thin to carry one", () => {
    expect(summarizeTradeOutcomes(records(2))[0].heldRate).toBeNull();
    expect(summarizeTradeOutcomes(records(MIN_LANE_HISTORY))[0].heldRate).toBe(100);
  });

  it("always carries not_causal, however much history accumulates", () => {
    const summary = summarizeTradeOutcomes(records(500))[0];
    expect(summary.limitations).toContain("not_causal");
    expect(summary.limitations).not.toContain("small_sample");
  });

  it("flags a thin sample explicitly rather than letting the number speak alone", () => {
    expect(summarizeTradeOutcomes(records(3))[0].limitations).toContain("small_sample");
  });

  it("orders lanes by how much history each has", () => {
    const summaries = summarizeTradeOutcomes([
      ...records(2, { lane: "produce:a~b", laneLabel: "A-B" }),
      ...records(5, { lane: "produce:c~d", laneLabel: "C-D" }),
    ]);
    expect(summaries.map((s) => s.lane)).toEqual(["produce:c~d", "produce:a~b"]);
  });
});

describe("outcomeLine", () => {
  it("states counts, and nothing beyond them", () => {
    expect(
      outcomeLine(
        "Produce between Harare and Marondera",
        {
          completed_good: 5,
          completed_issue: 1,
          did_not_happen: 1,
          declined: 0,
          unclear: 0,
        },
        7,
      ),
    ).toBe(
      "Produce between Harare and Marondera: 7 recorded — 5 completed well, 1 completed with an issue, 1 did not happen.",
    );
  });
});

describe("laneBrief", () => {
  it("says nothing at all when the history is too thin to be honest about", () => {
    const history = laneHistory(summarizeTradeOutcomes(records(2)));
    const brief = laneBrief(history, "produce:harare~marondera", "new");
    expect(brief.line).toBeNull();
    expect(brief.limitations).toContain("no_lane_history");
  });

  it("says nothing about a lane it has never seen", () => {
    expect(laneBrief(laneHistory([]), "produce:nowhere~nowhere", "new").line).toBeNull();
  });

  it("adds the narrower line only when that sample stands on its own", () => {
    const history = laneHistory(
      summarizeTradeOutcomes([
        ...records(6, { counterpartyClass: "rated" }),
        ...records(1, { counterpartyClass: "new" }),
      ]),
    );
    expect(laneBrief(history, "produce:harare~marondera", "rated").classLine).not.toBeNull();
    expect(laneBrief(history, "produce:harare~marondera", "new").classLine).toBeNull();
  });

  it("flags a lane whose settled trades mostly did not hold", () => {
    const history = laneHistory(
      summarizeTradeOutcomes([
        ...records(5, { outcome: "did_not_happen" }),
        ...records(1, { outcome: "completed_good" }),
      ]),
    );
    expect(laneBrief(history, "produce:harare~marondera", "new").mostlyFellThrough).toBe(true);
  });

  it("does not call a lane failed when its matches simply haven't concluded", () => {
    const history = laneHistory(
      summarizeTradeOutcomes([
        ...records(8, { outcome: "unclear" }),
        ...records(1, { outcome: "did_not_happen" }),
      ]),
    );
    expect(laneBrief(history, "produce:harare~marondera", "new").mostlyFellThrough).toBe(false);
  });
});

describe("assertSafeReasonText", () => {
  it("rejects a forecast dressed up as evidence", () => {
    expect(assertSafeReasonText("This buyer will pay on time").ok).toBe(false);
    expect(assertSafeReasonText("a guaranteed sale").ok).toBe(false);
    expect(assertSafeReasonText("this trader always pays").ok).toBe(false);
    expect(assertSafeReasonText("you should expect a quick sale").ok).toBe(false);
  });

  it("rejects a claim of cause", () => {
    expect(assertSafeReasonText("the trade fell through because they are far away").ok).toBe(false);
    expect(assertSafeReasonText("distance caused the delay").ok).toBe(false);
  });

  it("accepts a plain count", () => {
    expect(assertSafeReasonText("counterparty: 3 completed, 4.7★ (5 ratings)").ok).toBe(true);
    expect(assertSafeReasonText("Produce between Harare and Marondera: 7 recorded — 5 completed well.").ok).toBe(
      true,
    );
  });

  it("names what it objected to, so the fix is obvious", () => {
    expect(assertSafeReasonText("this will work").violations[0]).toContain("will");
  });
});

// The guard is only worth having if it actually runs over the text
// FarmaTrade ships. These are the sentences a farmer reads.
describe("every line FarmaTrade shows stays a report, not a forecast", () => {
  function post(overrides: Partial<Intent> = {}): Intent {
    return {
      id: "post-1",
      partyId: "party-1",
      side: "SUPPLY",
      category: "PRODUCE",
      title: "Maize",
      description: null,
      quantity: 10,
      unit: "TONNE",
      province: "Mashonaland East",
      district: "Marondera",
      askingPrice: null,
      status: "ACTIVE",
      urgent: false,
      neededBy: null,
      recurring: false,
      destinationProvince: null,
      destinationDistrict: null,
      travelDate: null,
      livestockId: null,
      produceId: null,
      equipmentId: null,
      createdAt: new Date(),
      expiresAt: null,
      ...overrides,
    } as Intent;
  }

  const reputation = {
    id: "rep-1",
    partyId: "party-1",
    completedCount: 12,
    completedGoodCount: 11,
    completedIssueCount: 1,
    didNotHappenCount: 0,
    averageRating: 4.7,
    ratingCount: 9,
    updatedAt: new Date(),
  } as Reputation;

  it("holds for every reason scoreMatch can emit", () => {
    const variants = [
      scoreMatch(post(), post(), null, null),
      scoreMatch(post(), post(), reputation, "FOUNDER"),
      scoreMatch(post(), post({ urgent: true }), { ...reputation, ratingCount: 0, averageRating: null }, "NETWORK"),
      scoreMatch(
        post({ province: "Manicaland", district: "Mutare", category: "TRANSPORT", destinationProvince: "Mashonaland East" }),
        post({ category: "TRANSPORT" }),
        null,
        null,
      ),
    ];
    for (const { reasons } of variants) {
      for (const reason of reasons) {
        expect(assertSafeReasonText(reason), reason).toMatchObject({ ok: true });
      }
    }
  });

  it("holds for every track-record line", () => {
    const outcomes: TradeOutcome[] = [
      "completed_good",
      "completed_issue",
      "did_not_happen",
      "declined",
      "unclear",
    ];
    const classes: CounterpartyClass[] = ["verified", "rated", "building", "new"];
    const all = outcomes.flatMap((outcome) =>
      classes.flatMap((counterpartyClass) => records(2, { outcome, counterpartyClass })),
    );
    for (const summary of summarizeTradeOutcomes(all)) {
      expect(assertSafeReasonText(summary.line), summary.line).toMatchObject({ ok: true });
      for (const c of summary.byClass) {
        expect(assertSafeReasonText(c.line), c.line).toMatchObject({ ok: true });
      }
    }
  });

  it("holds for every section heading and empty-state line", () => {
    for (const text of [...Object.values(BUCKET_LABEL), ...Object.values(BUCKET_EMPTY), CALM_MESSAGE]) {
      expect(assertSafeReasonText(text), text).toMatchObject({ ok: true });
    }
  });
});

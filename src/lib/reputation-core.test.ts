import { describe, expect, it } from "vitest";
import { pilotVisibleReason, summarizeReputation, MIN_RATINGS_FOR_AVERAGE } from "./reputation-core";
import type { Reputation } from "@/generated/prisma/client";

type ReputationInput = Pick<Reputation, "completedCount" | "averageRating" | "ratingCount">;

function reputation(overrides: Partial<ReputationInput> = {}): ReputationInput {
  return { completedCount: 0, averageRating: null, ratingCount: 0, ...overrides };
}

describe("summarizeReputation", () => {
  it("treats null reputation the same as zero completed trades", () => {
    expect(summarizeReputation(null)).toEqual(summarizeReputation(reputation()));
  });

  it("is 'New · no history yet' with tone 'new' when nothing has completed", () => {
    const summary = summarizeReputation(reputation());
    expect(summary.headline).toBe("New · no history yet");
    expect(summary.hasHistory).toBe(false);
    expect(summary.hasStars).toBe(false);
    expect(summary.tone).toBe("new");
  });

  it("shows stars only once ratingCount reaches MIN_RATINGS_FOR_AVERAGE", () => {
    const belowThreshold = summarizeReputation(
      reputation({ completedCount: 2, averageRating: 5, ratingCount: MIN_RATINGS_FOR_AVERAGE - 1 }),
      { showRatings: true },
    );
    const atThreshold = summarizeReputation(
      reputation({ completedCount: 2, averageRating: 5, ratingCount: MIN_RATINGS_FOR_AVERAGE }),
      { showRatings: true },
    );
    expect(belowThreshold.hasStars).toBe(false);
    expect(belowThreshold.headline).toBe(`Building history (${MIN_RATINGS_FOR_AVERAGE - 1})`);
    expect(atThreshold.hasStars).toBe(true);
    expect(atThreshold.headline).toBe("★ 5.0");
  });

  it("only 'Building history'/'★' states use tone 'success', and only once starred", () => {
    const starred = summarizeReputation(
      reputation({ completedCount: 4, averageRating: 4.5, ratingCount: MIN_RATINGS_FOR_AVERAGE }),
      { showRatings: true },
    );
    const building = summarizeReputation(reputation({ completedCount: 4, ratingCount: 1 }), {
      showRatings: true,
    });
    expect(starred.tone).toBe("success");
    expect(building.tone).toBe("new");
  });

  it("says 'Not yet rated' for a party with completed trades but zero ratings", () => {
    const summary = summarizeReputation(reputation({ completedCount: 3, ratingCount: 0 }), {
      showRatings: true,
    });
    expect(summary.headline).toBe("Not yet rated");
    expect(summary.hasHistory).toBe(true);
  });

  it("hides pilot star averages while preserving observed completion history", () => {
    const summary = summarizeReputation(
      reputation({ completedCount: 4, averageRating: 4.8, ratingCount: 12 }),
    );
    expect(summary).toMatchObject({
      hasHistory: true,
      hasStars: false,
      headline: "Trade history",
      completedLine: "4 completed trades",
    });
  });

  it("removes rating details from stored match reasons only at display time", () => {
    expect(pilotVisibleReason("counterparty: 12 completed, 4.7★ (9 ratings)"))
      .toBe("counterparty: 12 completed");
    expect(pilotVisibleReason("counterparty: 2 completed (still building rating history)"))
      .toBe("counterparty: 2 completed");
    expect(pilotVisibleReason("same district")).toBe("same district");
  });

  it("pluralizes the completed-trade count correctly", () => {
    expect(summarizeReputation(reputation({ completedCount: 1 })).completedLine).toBe(
      "1 completed trade",
    );
    expect(summarizeReputation(reputation({ completedCount: 2 })).completedLine).toBe(
      "2 completed trades",
    );
    expect(summarizeReputation(reputation({ completedCount: 0 })).completedLine).toBe(
      "0 completed trades",
    );
  });
});

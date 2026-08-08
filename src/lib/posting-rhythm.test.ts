import { describe, expect, it } from "vitest";
import {
  MIN_GAPS,
  computeRhythm,
  detectQuiet,
  gapsBetween,
  median,
  medianAbsoluteDeviation,
  ownRhythmNudge,
} from "./posting-rhythm";

const NOW = new Date("2026-08-08T09:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY);
}

// A party who posts every `every` days, `count` times, most recent
// `lastPostedDaysAgo` ago.
function postedEvery(every: number, count: number, lastPostedDaysAgo = 0): Date[] {
  return Array.from({ length: count }, (_, i) => daysAgo(lastPostedDaysAgo + i * every));
}

describe("median / medianAbsoluteDeviation", () => {
  it("is unmoved by an outlier that would drag a mean", () => {
    expect(median([10, 10, 10, 10, 500])).toBe(10);
  });

  it("handles an even-length sample", () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it("returns null for nothing rather than zero, which would read as a real value", () => {
    expect(median([])).toBeNull();
    expect(medianAbsoluteDeviation([])).toBeNull();
  });

  it("measures typical spread, not worst-case spread", () => {
    expect(medianAbsoluteDeviation([10, 10, 10, 10, 500])).toBe(0);
    expect(medianAbsoluteDeviation([10, 20, 30, 40, 50])).toBe(10);
  });
});

describe("gapsBetween", () => {
  it("returns days between consecutive posts, oldest first", () => {
    expect(gapsBetween([daysAgo(30), daysAgo(20), daysAgo(5)])).toEqual([10, 15]);
  });

  it("sorts first, so an unordered query result still measures correctly", () => {
    expect(gapsBetween([daysAgo(5), daysAgo(30), daysAgo(20)])).toEqual([10, 15]);
  });

  it("has no gaps to report from a single post", () => {
    expect(gapsBetween([daysAgo(5)])).toEqual([]);
  });
});

describe("computeRhythm", () => {
  it("says it is still learning rather than guessing from too little", () => {
    const rhythm = computeRhythm(postedEvery(20, 3));
    expect(rhythm.confidence).toBe("learning");
    expect(rhythm.normalDays).toBeNull();
    expect(rhythm.basis).toContain(`/${MIN_GAPS} gaps`);
  });

  it("reports a rhythm once there is enough history to see one", () => {
    const rhythm = computeRhythm(postedEvery(20, 6));
    expect(rhythm.normalDays).toBe(20);
    expect(rhythm.gaps).toBe(5);
    expect(rhythm.confidence).not.toBe("learning");
  });

  it("grows more confident as the history grows", () => {
    expect(computeRhythm(postedEvery(20, 6)).confidence).toBe("tentative");
    expect(computeRhythm(postedEvery(20, 8)).confidence).toBe("emerging");
    expect(computeRhythm(postedEvery(20, 12)).confidence).toBe("clear");
  });

  it("is not redefined by one unusual season", () => {
    const steady = postedEvery(20, 8);
    const withOutlier = [...steady, new Date(steady[steady.length - 1].getTime() - 400 * DAY)];
    expect(computeRhythm(withOutlier).normalDays).toBe(computeRhythm(steady).normalDays);
  });

  it("compares a smallholder to themselves, not to a commercial farm", () => {
    // Two farms with wildly different volumes both get an accurate read of
    // their own normal — which is the entire point.
    expect(computeRhythm(postedEvery(90, 8)).normalDays).toBe(90);
    expect(computeRhythm(postedEvery(4, 8)).normalDays).toBe(4);
  });
});

describe("detectQuiet", () => {
  it("stays silent while a party is posting at their usual pace", () => {
    const read = detectQuiet(postedEvery(20, 8, 5), NOW);
    expect(read.quiet).toBe(false);
    expect(read.line).toBeNull();
  });

  it("notices a regular poster who has stopped", () => {
    const read = detectQuiet(postedEvery(20, 8, 90), NOW);
    expect(read.quiet).toBe(true);
    expect(read.line).toBe("Usually posts about every 20 days — it has been 90.");
  });

  it("never fires on a party whose rhythm we have not learned", () => {
    expect(detectQuiet(postedEvery(20, 3, 400), NOW).quiet).toBe(false);
    expect(detectQuiet([], NOW).quiet).toBe(false);
  });

  it("does not flag a metronomic poster for being a few days late", () => {
    // Gaps are identical, so the spread floor is what stops a one-day
    // overrun reading as a departure.
    expect(detectQuiet(postedEvery(20, 10, 22), NOW).quiet).toBe(false);
  });

  it("does not flag a party who has no schedule to be late for", () => {
    const erratic = [daysAgo(300), daysAgo(295), daysAgo(180), daysAgo(120), daysAgo(40)];
    expect(detectQuiet(erratic, NOW).quiet).toBe(false);
  });

  it("states a count and a comparison, never a reason", () => {
    const line = detectQuiet(postedEvery(20, 8, 90), NOW).line!;
    expect(line).not.toMatch(/because|probably|likely|stopped farming|lost interest/i);
  });
});

describe("ownRhythmNudge", () => {
  it("addresses the farmer about their own farm, and invites rather than scolds", () => {
    const nudge = ownRhythmNudge(postedEvery(20, 8, 90), NOW)!;
    expect(nudge).toContain("You usually list something about every 20 days");
    expect(nudge).toContain("Worth posting");
  });

  it("says nothing when there is nothing to say", () => {
    expect(ownRhythmNudge(postedEvery(20, 8, 5), NOW)).toBeNull();
    expect(ownRhythmNudge(postedEvery(20, 2), NOW)).toBeNull();
  });
});

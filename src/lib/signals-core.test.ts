import { describe, expect, it } from "vitest";
import { deriveSignals, median, MIN_SAMPLE, type WindowCounts } from "./signals-core";

function window(overrides: Partial<WindowCounts> = {}): WindowCounts {
  return {
    category: "PRODUCE",
    region: "Manicaland",
    subject: null,
    recentDemand: 0,
    recentSupply: 0,
    priorDemand: 0,
    priorSupply: 0,
    recentMedianPrice: null,
    priorMedianPrice: null,
    ...overrides,
  };
}

function kinds(signals: { kind: string }[]) {
  return signals.map((s) => s.kind);
}

describe("deriveSignals — demand trend", () => {
  it("reports rising demand when it jumps against a real prior window", () => {
    const signals = deriveSignals([
      window({ recentDemand: 12, priorDemand: 5, recentSupply: 10, priorSupply: 10 }),
    ]);
    expect(kinds(signals)).toContain("DEMAND_RISING");
    expect(signals[0].headline).toMatch(/up \d+%/);
  });

  it("reports falling demand", () => {
    const signals = deriveSignals([
      window({ recentDemand: 5, priorDemand: 15, recentSupply: 6, priorSupply: 6 }),
    ]);
    expect(kinds(signals)).toContain("DEMAND_FALLING");
  });

  it(`says nothing about a trend below ${MIN_SAMPLE} recent posts`, () => {
    // Four buyers is one busy Tuesday. Calling it a trend is how a page
    // teaches its readers to ignore it.
    const signals = deriveSignals([window({ recentDemand: 4, priorDemand: 1 })]);
    expect(kinds(signals)).not.toContain("DEMAND_RISING");
  });

  it("ignores a wobble inside the noise band", () => {
    const signals = deriveSignals([
      window({ recentDemand: 11, priorDemand: 10, recentSupply: 10, priorSupply: 10 }),
    ]);
    expect(kinds(signals)).not.toContain("DEMAND_RISING");
    expect(kinds(signals)).not.toContain("DEMAND_FALLING");
  });
});

describe("deriveSignals — supply and demand balance", () => {
  it("calls a seller's market when buyers outnumber sellers", () => {
    const signals = deriveSignals([window({ recentDemand: 10, recentSupply: 2 })]);
    expect(kinds(signals)).toContain("SUPPLY_TIGHT");
  });

  it("calls a glut when sellers outnumber buyers", () => {
    const signals = deriveSignals([window({ recentDemand: 2, recentSupply: 10 })]);
    expect(kinds(signals)).toContain("SUPPLY_GLUT");
  });

  it("does not divide by zero when one side is completely absent", () => {
    const signals = deriveSignals([window({ recentDemand: 8, recentSupply: 0 })]);
    expect(kinds(signals)).toContain("SUPPLY_TIGHT");
    for (const s of signals) {
      expect(Number.isFinite(s.strength)).toBe(true);
      expect(s.strength).toBeLessThanOrEqual(1);
    }
  });

  it("uses transport-specific wording for the transport category", () => {
    const scarce = deriveSignals([
      window({ category: "TRANSPORT", recentDemand: 12, recentSupply: 3 }),
    ]);
    expect(kinds(scarce)).toContain("TRANSPORT_SCARCE");
    expect(scarce[0].headline).toMatch(/transport is scarce/i);

    const available = deriveSignals([
      window({ category: "TRANSPORT", recentDemand: 3, recentSupply: 12 }),
    ]);
    expect(kinds(available)).toContain("TRANSPORT_AVAILABLE");
  });
});

describe("deriveSignals — price movement", () => {
  it("reports a rise above the noise threshold", () => {
    const signals = deriveSignals([
      window({
        recentDemand: 5,
        recentSupply: 5,
        recentMedianPrice: 130,
        priorMedianPrice: 100,
      }),
    ]);
    expect(kinds(signals)).toContain("PRICE_RISING");
  });

  it("ignores a small price wobble", () => {
    const signals = deriveSignals([
      window({
        recentDemand: 5,
        recentSupply: 5,
        recentMedianPrice: 104,
        priorMedianPrice: 100,
      }),
    ]);
    expect(kinds(signals)).not.toContain("PRICE_RISING");
    expect(kinds(signals)).not.toContain("PRICE_FALLING");
  });
});

describe("deriveSignals — strength", () => {
  it("rates the same effect higher when more posts back it", () => {
    const [small] = deriveSignals([window({ recentDemand: 6, priorDemand: 2, recentSupply: 6, priorSupply: 6 })]);
    const [large] = deriveSignals([window({ recentDemand: 60, priorDemand: 20, recentSupply: 60, priorSupply: 60 })]);
    expect(large.strength).toBeGreaterThan(small.strength);
  });

  it("always carries the sample size it was computed from", () => {
    const signals = deriveSignals([window({ recentDemand: 10, recentSupply: 2 })]);
    for (const s of signals) expect(s.sampleSize).toBeGreaterThan(0);
  });

  it("returns signals strongest first", () => {
    const signals = deriveSignals([
      window({ region: "Harare", recentDemand: 6, recentSupply: 5, priorDemand: 5, priorSupply: 5 }),
      window({ region: "Manicaland", recentDemand: 40, recentSupply: 2 }),
    ]);
    for (let i = 1; i < signals.length; i++) {
      expect(signals[i - 1].strength).toBeGreaterThanOrEqual(signals[i].strength);
    }
  });
});

describe("median", () => {
  it("is null for no values", () => {
    expect(median([])).toBeNull();
  });
  it("takes the middle of an odd-length set", () => {
    expect(median([5, 1, 3])).toBe(3);
  });
  it("averages the two middles of an even-length set", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("resists a single huge outlier, unlike a mean", () => {
    // The whole reason for median: one export contract priced per tonne
    // sitting beside smallholder crate prices shouldn't set "the market".
    expect(median([10, 11, 12, 100_000])).toBe(11.5);
  });
});

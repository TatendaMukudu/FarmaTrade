import { describe, expect, it } from "vitest";
import {
  counterpartyConcentration,
  reputationProvenance,
  findClosedPairs,
  CLOSED_PAIR_THRESHOLD,
  type TradeCounterparty,
} from "./trust-integrity";

function trades(...pairs: [string, number][]): TradeCounterparty[] {
  return pairs.map(([counterpartyId, completedTrades]) => ({ counterpartyId, completedTrades }));
}

describe("counterpartyConcentration", () => {
  it("is 1 when every trade is with the same party", () => {
    expect(counterpartyConcentration(trades(["b", 12]))).toBe(1);
  });

  it("approaches 1/n when trades are spread evenly", () => {
    expect(counterpartyConcentration(trades(["a", 5], ["b", 5], ["c", 5], ["d", 5]))).toBeCloseTo(0.25);
  });

  it("is higher for lopsided spread than for even spread across the same partner count", () => {
    const lopsided = counterpartyConcentration(trades(["a", 9], ["b", 1], ["c", 1]));
    const even = counterpartyConcentration(trades(["a", 4], ["b", 4], ["c", 3]));
    expect(lopsided).toBeGreaterThan(even);
  });

  it("is 0 with no trades", () => {
    expect(counterpartyConcentration([])).toBe(0);
    expect(counterpartyConcentration(trades(["a", 0]))).toBe(0);
  });
});

describe("reputationProvenance", () => {
  it("states plainly when a whole reputation rests on one relationship", () => {
    const p = reputationProvenance(trades(["b", 14]));
    expect(p.narrow).toBe(true);
    expect(p.distinctPartners).toBe(1);
    expect(p.label).toBe("All 14 trades with the same partner");
  });

  it("rates a broadly-corroborated record higher than a manufactured one of the same size", () => {
    // The whole point: a two-account ring and an honest trader can reach
    // identical trade counts and star averages. Breadth is what separates
    // them, and it isn't cheap to fake.
    const ring = reputationProvenance(trades(["accomplice", 14]));
    const honest = reputationProvenance(
      trades(["a", 3], ["b", 2], ["c", 2], ["d", 3], ["e", 2], ["f", 2]),
    );
    expect(honest.totalTrades).toBe(14);
    expect(ring.totalTrades).toBe(14);
    expect(honest.breadth).toBeGreaterThan(ring.breadth);
    expect(honest.narrow).toBe(false);
  });

  it("does not call a well-spread record narrow", () => {
    const p = reputationProvenance(trades(["a", 4], ["b", 3], ["c", 3]));
    expect(p.narrow).toBe(false);
    expect(p.label).toBe("10 trades across 3 different partners");
  });

  it("is not fooled by padding the partner count with token trades", () => {
    // A ring adding sockpuppets that each trade once, while the real volume
    // stays between the two main accounts.
    const padded = reputationProvenance(
      trades(["accomplice", 20], ["p1", 1], ["p2", 1], ["p3", 1]),
    );
    const genuine = reputationProvenance(
      trades(["a", 6], ["b", 6], ["c", 6], ["d", 5]),
    );
    expect(genuine.breadth).toBeGreaterThan(padded.breadth);
  });

  it("says nothing misleading about a brand-new party", () => {
    const p = reputationProvenance([]);
    expect(p.totalTrades).toBe(0);
    expect(p.narrow).toBe(false);
    expect(p.label).toBe("No completed trades yet");
  });

  it("handles a single trade without implying a pattern", () => {
    const p = reputationProvenance(trades(["b", 1]));
    expect(p.label).toBe("All 1 trade with the same partner");
  });
});

describe("findClosedPairs", () => {
  it("finds two accounts that only ever trade with each other", () => {
    const graph = new Map([
      ["ring-a", trades(["ring-b", 8])],
      ["ring-b", trades(["ring-a", 8])],
    ]);
    const pairs = findClosedPairs(graph);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ partyA: "ring-a", partyB: "ring-b", sharedTrades: 8 });
    expect(pairs[0].mutualDependency).toBe(1);
  });

  it("leaves a farmer with one loyal buyer alone when the buyer trades widely", () => {
    // The false positive that matters. The smallholder sells everything to
    // one buyer; the buyer purchases from twenty farms. Only one side is
    // dependent, so it is not a closed loop — taking the max instead of the
    // min here would flag every smallholder on the platform.
    const graph = new Map([
      ["smallholder", trades(["big-buyer", 9])],
      ["big-buyer", trades(["smallholder", 9], ["farm-2", 30], ["farm-3", 25], ["farm-4", 40])],
    ]);
    expect(findClosedPairs(graph)).toEqual([]);
  });

  it("ignores a pair below the minimum trade count", () => {
    const graph = new Map([
      ["a", trades(["b", 2])],
      ["b", trades(["a", 2])],
    ]);
    expect(findClosedPairs(graph)).toEqual([]);
  });

  it(`ignores a pair below the ${CLOSED_PAIR_THRESHOLD} dependency threshold`, () => {
    const graph = new Map([
      ["a", trades(["b", 4], ["c", 6])],
      ["b", trades(["a", 4], ["d", 6])],
    ]);
    expect(findClosedPairs(graph)).toEqual([]);
  });

  it("reports each pair once, not once per direction", () => {
    const graph = new Map([
      ["a", trades(["b", 10])],
      ["b", trades(["a", 10])],
    ]);
    expect(findClosedPairs(graph)).toHaveLength(1);
  });

  it("skips a counterparty whose own trade history isn't in the graph", () => {
    // Can't establish mutuality without both sides, and guessing would
    // manufacture an accusation from missing data.
    const graph = new Map([["a", trades(["unknown", 10])]]);
    expect(findClosedPairs(graph)).toEqual([]);
  });
});

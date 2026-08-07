import { describe, expect, it } from "vitest";
import {
  OBJECTIVES,
  ALL_OBJECTIVES,
  COMMON_OBJECTIVES,
  objectivesPair,
  categoriesForObjective,
} from "./objectives";

describe("objective counterparts", () => {
  it("are symmetric: the counterpart of a counterpart is the original", () => {
    // The property the whole matching engine rests on. If it broke for one
    // objective, posts of that kind would generate matches in one direction
    // only — and which direction would depend on who happened to post first.
    for (const spec of ALL_OBJECTIVES) {
      expect(OBJECTIVES[spec.counterpart].counterpart).toBe(spec.objective);
    }
  });

  it("always pair a HAVE with a NEED", () => {
    for (const spec of ALL_OBJECTIVES) {
      expect(OBJECTIVES[spec.counterpart].type).not.toBe(spec.type);
    }
  });

  it("never make an objective its own counterpart", () => {
    for (const spec of ALL_OBJECTIVES) {
      expect(spec.counterpart).not.toBe(spec.objective);
    }
  });
});

describe("objectivesPair", () => {
  it("pairs selling with buying", () => {
    expect(objectivesPair("SELL", "BUY")).toBe(true);
    expect(objectivesPair("BUY", "SELL")).toBe(true);
  });

  it("does not pair a sale with a rental — the bug the objective layer exists to fix", () => {
    expect(objectivesPair("SELL", "RENT")).toBe(false);
    expect(objectivesPair("RENT_OUT", "BUY")).toBe(false);
  });

  it("pairs renting out with renting", () => {
    expect(objectivesPair("RENT_OUT", "RENT")).toBe(true);
  });
});

describe("categoriesForObjective", () => {
  it("lets SELL and BUY span every goods vertical", () => {
    expect(categoriesForObjective("SELL")).toEqual([
      "PRODUCE",
      "LIVESTOCK",
      "EQUIPMENT",
      "INPUTS",
    ]);
    expect(categoriesForObjective("BUY")).toEqual(categoriesForObjective("SELL"));
  });

  it("pins a single-vertical objective to exactly one category", () => {
    expect(categoriesForObjective("TRANSPORT_NEED")).toEqual(["TRANSPORT"]);
    expect(categoriesForObjective("STORAGE_OFFER")).toEqual(["STORAGE"]);
  });
});

describe("COMMON_OBJECTIVES", () => {
  it("covers every objective exactly once, so the composer can't hide one", () => {
    expect([...COMMON_OBJECTIVES].sort()).toEqual(
      ALL_OBJECTIVES.map((o) => o.objective).sort(),
    );
  });
});

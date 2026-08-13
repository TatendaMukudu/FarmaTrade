import { describe, expect, it } from "vitest";
import {
  resolveMatchSides,
  groupMatchesByOwnIntent,
  combinedOfferedQuantity,
  isPartyInMatch,
  distanceLabel,
  estimatedIntentValue,
} from "./match-view";

type TestPost = { id: string; partyId: string; quantity: number | null };
type TestMatch = { id: string; intentA: TestPost; intentB: TestPost };

function match(id: string, intentA: TestPost, intentB: TestPost): TestMatch {
  return { id, intentA, intentB };
}

describe("resolveMatchSides", () => {
  it("returns intentA as 'yours' when the viewer owns intentA", () => {
    const m = match("m1", { id: "p1", partyId: "me", quantity: 5 }, { id: "p2", partyId: "them", quantity: 3 });
    const { yours, theirs } = resolveMatchSides(m, "me");
    expect(yours.id).toBe("p1");
    expect(theirs.id).toBe("p2");
  });

  it("returns intentB as 'yours' when the viewer owns intentB", () => {
    const m = match("m1", { id: "p1", partyId: "them", quantity: 5 }, { id: "p2", partyId: "me", quantity: 3 });
    const { yours, theirs } = resolveMatchSides(m, "me");
    expect(yours.id).toBe("p2");
    expect(theirs.id).toBe("p1");
  });
});

describe("groupMatchesByOwnIntent", () => {
  it("groups multiple matches under the same own-post, preserving first-appearance order", () => {
    const mine = { id: "need-1", partyId: "me", quantity: 100 };
    const matches = [
      match("m1", mine, { id: "have-1", partyId: "a", quantity: 30 }),
      match("m2", { id: "have-2", partyId: "b", quantity: 40 }, mine),
      match("m3", { id: "need-2", partyId: "me", quantity: 50 }, { id: "have-3", partyId: "c", quantity: 20 }),
    ];
    const groups = groupMatchesByOwnIntent(matches, "me");
    expect(groups.map((g) => g.yours.id)).toEqual(["need-1", "need-2"]);
    expect(groups[0].matches.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(groups[1].matches).toHaveLength(1);
  });
});

describe("combinedOfferedQuantity", () => {
  const mine = { id: "need-1", partyId: "me", quantity: 100 };
  const matches = [
    match("m1", mine, { id: "have-1", partyId: "a", quantity: 30 }),
    match("m2", { id: "have-2", partyId: "b", quantity: null }, mine),
    match("m3", mine, { id: "have-3", partyId: "c", quantity: 20 }),
  ];

  it("sums what each counterparty still has, not what they first offered", () => {
    // have-1 offered 30 but has already agreed 25 of them elsewhere, so it
    // contributes 5. Counting the 30 would tell this buyer their order was
    // covered when most of it is spoken for.
    const remaining = new Map<string, number | null>([
      ["have-1", 5],
      ["have-2", null],
      ["have-3", 20],
    ]);
    expect(combinedOfferedQuantity(matches, "me", (i) => remaining.get(i.id) ?? null)).toEqual({
      total: 25,
      unbounded: 1,
    });
  });

  it("counts counterparties who named no ceiling rather than reading them as zero", () => {
    expect(combinedOfferedQuantity(matches, "me", () => null)).toEqual({
      total: 0,
      unbounded: 3,
    });
  });
});

describe("isPartyInMatch", () => {
  it("is true when the party is on either side", () => {
    const m = { intentA: { partyId: "a" }, intentB: { partyId: "b" } };
    expect(isPartyInMatch(m, "a")).toBe(true);
    expect(isPartyInMatch(m, "b")).toBe(true);
    expect(isPartyInMatch(m, "c")).toBe(false);
  });
});

describe("distanceLabel", () => {
  it("prefers 'Same district' over 'Same province'", () => {
    expect(distanceLabel("Mutare", "Manicaland", "Mutare", "Manicaland")).toBe("Same district");
  });
  it("falls back to 'Same province' when only the province matches", () => {
    expect(distanceLabel("Chimanimani", "Manicaland", "Mutare", "Manicaland")).toBe("Same province");
  });
  it("falls back to the counterparty's province name otherwise", () => {
    expect(distanceLabel("Harare", "Harare", "Mutare", "Manicaland")).toBe("Harare");
  });
});

describe("estimatedIntentValue", () => {
  it("is null when there is no asking price", () => {
    expect(estimatedIntentValue({ askingPrice: null, quantity: 10 })).toBeNull();
  });
  it("multiplies price by quantity when both are present", () => {
    expect(estimatedIntentValue({ askingPrice: 5, quantity: 10 })).toBe(50);
  });
  it("is just the price when quantity is absent", () => {
    expect(estimatedIntentValue({ askingPrice: 5, quantity: null })).toBe(5);
  });
  it("coerces a Prisma Decimal-like value via Number()", () => {
    expect(estimatedIntentValue({ askingPrice: { toString: () => "12.5" }, quantity: 2 })).toBe(25);
  });
});

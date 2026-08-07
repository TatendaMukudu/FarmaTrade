import { describe, expect, it } from "vitest";
import {
  resolveMatchSides,
  groupMatchesByOwnPost,
  combinedOfferedQuantity,
  isPartyInMatch,
  distanceLabel,
  estimatedPostValue,
} from "./match-view";

type TestPost = { id: string; partyId: string; quantity: number | null };
type TestMatch = { id: string; postA: TestPost; postB: TestPost };

function match(id: string, postA: TestPost, postB: TestPost): TestMatch {
  return { id, postA, postB };
}

describe("resolveMatchSides", () => {
  it("returns postA as 'yours' when the viewer owns postA", () => {
    const m = match("m1", { id: "p1", partyId: "me", quantity: 5 }, { id: "p2", partyId: "them", quantity: 3 });
    const { yours, theirs } = resolveMatchSides(m, "me");
    expect(yours.id).toBe("p1");
    expect(theirs.id).toBe("p2");
  });

  it("returns postB as 'yours' when the viewer owns postB", () => {
    const m = match("m1", { id: "p1", partyId: "them", quantity: 5 }, { id: "p2", partyId: "me", quantity: 3 });
    const { yours, theirs } = resolveMatchSides(m, "me");
    expect(yours.id).toBe("p2");
    expect(theirs.id).toBe("p1");
  });
});

describe("groupMatchesByOwnPost", () => {
  it("groups multiple matches under the same own-post, preserving first-appearance order", () => {
    const mine = { id: "need-1", partyId: "me", quantity: 100 };
    const matches = [
      match("m1", mine, { id: "have-1", partyId: "a", quantity: 30 }),
      match("m2", { id: "have-2", partyId: "b", quantity: 40 }, mine),
      match("m3", { id: "need-2", partyId: "me", quantity: 50 }, { id: "have-3", partyId: "c", quantity: 20 }),
    ];
    const groups = groupMatchesByOwnPost(matches, "me");
    expect(groups.map((g) => g.yours.id)).toEqual(["need-1", "need-2"]);
    expect(groups[0].matches.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(groups[1].matches).toHaveLength(1);
  });
});

describe("combinedOfferedQuantity", () => {
  it("sums the counterparty's quantity across matches, treating null as zero", () => {
    const mine = { id: "need-1", partyId: "me", quantity: 100 };
    const matches = [
      match("m1", mine, { id: "have-1", partyId: "a", quantity: 30 }),
      match("m2", { id: "have-2", partyId: "b", quantity: null }, mine),
      match("m3", mine, { id: "have-3", partyId: "c", quantity: 20 }),
    ];
    expect(combinedOfferedQuantity(matches, "me")).toBe(50);
  });
});

describe("isPartyInMatch", () => {
  it("is true when the party is on either side", () => {
    const m = { postA: { partyId: "a" }, postB: { partyId: "b" } };
    expect(isPartyInMatch(m, "a")).toBe(true);
    expect(isPartyInMatch(m, "b")).toBe(true);
    expect(isPartyInMatch(m, "c")).toBe(false);
  });
});

describe("distanceLabel", () => {
  it("prefers 'Same locality' over 'Same region'", () => {
    expect(distanceLabel("Mutare", "Manicaland", "Mutare", "Manicaland")).toBe("Same locality");
  });
  it("falls back to 'Same region' when only the region matches", () => {
    expect(distanceLabel("Chimanimani", "Manicaland", "Mutare", "Manicaland")).toBe("Same region");
  });
  it("falls back to the counterparty's region name otherwise", () => {
    expect(distanceLabel("Harare", "Harare", "Mutare", "Manicaland")).toBe("Harare");
  });
});

describe("estimatedPostValue", () => {
  it("is null when there is no asking price", () => {
    expect(estimatedPostValue({ askingPrice: null, quantity: 10, currency: "USD" })).toBeNull();
  });
  it("multiplies price by quantity when both are present", () => {
    expect(estimatedPostValue({ askingPrice: 5, quantity: 10, currency: "USD" })).toEqual({
      amount: 50,
      currency: "USD",
    });
  });
  it("is just the price when quantity is absent", () => {
    expect(estimatedPostValue({ askingPrice: 5, quantity: null, currency: "USD" })).toEqual({
      amount: 5,
      currency: "USD",
    });
  });
  it("coerces a Prisma Decimal-like value via Number()", () => {
    expect(
      estimatedPostValue({ askingPrice: { toString: () => "12.5" }, quantity: 2, currency: "ZiG" }),
    ).toEqual({ amount: 25, currency: "ZiG" });
  });
  it("carries the post's own currency through, not a hardcoded default", () => {
    expect(estimatedPostValue({ askingPrice: 100, quantity: null, currency: "ZAR" })).toEqual({
      amount: 100,
      currency: "ZAR",
    });
  });
});

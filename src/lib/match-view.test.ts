import { describe, expect, it } from "vitest";
import {
  resolveMatchSides,
  groupMatchesByOwnIntent,
  combinedOfferedQuantity,
  isPartyInMatch,
  distanceLabel,
  estimatedIntentValue,
} from "./match-view";
import { moneyToMajor } from "./money";

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
  // These assertions used to read `price × quantity === 50`, which was one
  // half of the contradiction this phase exists to end: the same column was
  // multiplied here and divided in loadPriceSignals. Neither reading
  // survives. A value now appears only where the price records what it
  // means.
  const intent = (overrides: Record<string, unknown> = {}) => ({
    askingPrice: 500,
    priceCurrency: "USD",
    priceBasis: "PER_UNIT",
    priceUnitCode: "METRIC_TONNE",
    quantity: 2,
    unitCode: "METRIC_TONNE",
    ...overrides,
  });

  const total = (r: ReturnType<typeof estimatedIntentValue>) =>
    r.ok ? moneyToMajor(r.total) : null;

  // S. Explicit per-unit intent pricing.
  it("values 2 tonnes at 500 USD per tonne as 1000 USD", () => {
    expect(total(estimatedIntentValue(intent()))).toBe(1000);
  });

  // T. Explicit total intent pricing.
  it("returns a stated total without multiplying it by the quantity", () => {
    // The old reading would have made this 2000 for a farmer who said the
    // whole lot was 1000.
    const result = estimatedIntentValue(
      intent({ askingPrice: 1000, priceBasis: "TOTAL", priceUnitCode: null }),
    );
    expect(total(result)).toBe(1000);
  });

  it("values a cross-unit rate correctly", () => {
    expect(total(estimatedIntentValue(intent({ quantity: 750, unitCode: "KILOGRAM" })))).toBe(375);
  });

  it("has no value when there is no asking price", () => {
    expect(estimatedIntentValue(intent({ askingPrice: null }))).toEqual({
      ok: false,
      reason: "no_price",
    });
  });

  // R. Legacy ambiguity is not resolved by guessing.
  it("produces nothing at all from a legacy price with no recorded basis", () => {
    expect(
      estimatedIntentValue(intent({ priceBasis: null, priceUnitCode: null })),
    ).toEqual({ ok: false, reason: "ambiguous_legacy" });
  });

  it("does not assume a missing currency", () => {
    expect(estimatedIntentValue(intent({ priceCurrency: null }))).toEqual({
      ok: false,
      reason: "unknown_currency",
    });
  });

  it("coerces a Prisma Decimal-like value via Number()", () => {
    const decimalish = { toString: () => "500", valueOf: () => 500 };
    expect(total(estimatedIntentValue(intent({ askingPrice: decimalish })))).toBe(1000);
  });
});

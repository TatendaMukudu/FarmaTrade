import { describe, expect, it } from "vitest";
import {
  basisFor,
  combinedRemaining,
  consumesCapacity,
  fitsWithin,
  hasRemainingCapacity,
  pairwiseQuantity,
  readCapacity,
  unmeasuredCount,
  type Allocation,
} from "./capacity";
import { UNITS } from "./measurement";

// A reservation held by a bilateral agreement. Whether an engagement
// reserves at all is agreement-core's judgement, tested there; this module
// only does the arithmetic over the answer.
function allocation(overrides: Partial<Allocation> = {}): Allocation {
  return {
    reserves: true,
    quantity: 8,
    unit: "tonne",
    unitCode: "METRIC_TONNE",
    basis: "mutual_agreement",
    ...overrides,
  };
}

// An intent authorizing 20 tonnes.
const supply20 = { quantity: 20, unitCode: "METRIC_TONNE" };
// An intent authorizing 2 tonnes — the worked example from the spec.
const supply2t = { quantity: 2, unitCode: "METRIC_TONNE" };

describe("consumesCapacity", () => {
  it("reads the reservation rather than re-deciding it", () => {
    // The bilateral-consent rule lives in exactly one place. A second copy
    // of it here would be a second thing to keep in step.
    expect(consumesCapacity({ reserves: true })).toBe(true);
    expect(consumesCapacity({ reserves: false })).toBe(false);
  });
});

describe("basisFor", () => {
  it("puts mass intents on a kilogram basis whatever they were typed in", () => {
    expect(basisFor({ unitCode: "METRIC_TONNE" })?.code).toBe("KILOGRAM");
    expect(basisFor({ unitCode: "KILOGRAM" })?.code).toBe("KILOGRAM");
  });

  it("leaves a package intent on its own package", () => {
    expect(basisFor({ unitCode: "BAG" })?.code).toBe("BAG");
  });

  it("has no basis for an intent with no resolvable unit", () => {
    expect(basisFor({ unitCode: null })).toBeNull();
    expect(basisFor({ unitCode: "PUNNET" })).toBeNull();
  });
});

describe("readCapacity", () => {
  it("subtracts an agreement in the same unit", () => {
    expect(readCapacity(supply20, [allocation({ quantity: 8 })])).toMatchObject({
      authorized: 20000,
      reserved: 8000,
      remaining: 12000,
    });
  });

  // D. Mixed-unit capacity, the spec's worked example.
  it("subtracts 500 kg and 0.25 tonnes from 2 tonnes and leaves 1.25 tonnes", () => {
    const reading = readCapacity(supply2t, [
      allocation({ quantity: 500, unit: "kg", unitCode: "KILOGRAM" }),
      allocation({ quantity: 0.25, unit: "tonne", unitCode: "METRIC_TONNE" }),
    ]);
    expect(reading.authorized).toBe(2000);
    expect(reading.reserved).toBe(750);
    expect(reading.remaining).toBe(1250);
    expect(reading.basis?.code).toBe("KILOGRAM");
  });

  // The headline example from the checkpoint question.
  it("proves 2000 kg minus 750 kg minus 500 kg leaves 750 kg", () => {
    const reading = readCapacity(supply2t, [
      allocation({ quantity: 750, unitCode: "KILOGRAM" }),
      allocation({ quantity: 500, unitCode: "KILOGRAM" }),
    ]);
    expect(reading.remaining).toBe(750);
    expect(unmeasuredCount(reading.unmeasured)).toBe(0);
  });

  it("ignores engagements that reserve nothing", () => {
    expect(
      readCapacity(supply20, [allocation({ reserves: false }), allocation({ reserves: false })])
        .reserved,
    ).toBe(0);
  });

  // Q. Contextual packaging.
  it("refuses to weigh bags against a tonnage, and says why", () => {
    // The buyer asking for 10 bags is the spec's own case: FarmaTrade must
    // not pretend to know whether they fit.
    const reading = readCapacity(supply2t, [
      allocation({ quantity: 10, unit: "bags", unitCode: "BAG" }),
    ]);
    expect(reading.reserved).toBe(0);
    expect(reading.remaining).toBe(2000);
    expect(reading.unmeasured.context_required).toBe(1);
  });

  it("counts bags against a bag-denominated intent, because that needs no conversion", () => {
    const reading = readCapacity({ quantity: 30, unitCode: "BAG" }, [
      allocation({ quantity: 10, unit: "bags", unitCode: "BAG" }),
    ]);
    expect(reading.remaining).toBe(20);
    expect(unmeasuredCount(reading.unmeasured)).toBe(0);
  });

  it("does not count crates against a bag intent", () => {
    const reading = readCapacity({ quantity: 30, unitCode: "BAG" }, [
      allocation({ quantity: 10, unitCode: "CRATE" }),
    ]);
    expect(reading.remaining).toBe(30);
    expect(reading.unmeasured.context_required).toBe(1);
  });

  // I. Dimensional incompatibility, reported distinctly.
  it("never nets litres off a tonnage", () => {
    const reading = readCapacity(supply2t, [allocation({ quantity: 500, unitCode: "LITRE" })]);
    expect(reading.reserved).toBe(0);
    expect(reading.unmeasured.incompatible_dimension).toBe(1);
    expect(reading.unmeasured.context_required).toBe(0);
  });

  // J. Unknown unit, reported distinctly from the other three.
  it("reports an unrecognised unit as its own kind of problem", () => {
    const reading = readCapacity(supply2t, [
      allocation({ quantity: 5, unit: "punnets", unitCode: null }),
    ]);
    expect(reading.reserved).toBe(0);
    expect(reading.unmeasured.unknown_unit).toBe(1);
  });

  it("reports an agreement nobody put a number on as its own kind of problem", () => {
    const reading = readCapacity(supply2t, [allocation({ quantity: null })]);
    expect(reading.unmeasured.no_quantity).toBe(1);
    expect(reading.unmeasured.unknown_unit).toBe(0);
  });

  // P. Null quantity.
  it("is unbounded, not empty, when nobody stated a quantity", () => {
    expect(readCapacity({ quantity: null, unitCode: null }, []).remaining).toBeNull();
    expect(readCapacity({ quantity: null, unitCode: "METRIC_TONNE" }, [allocation()]).remaining)
      .toBeNull();
  });

  it("keeps unit-less intents working exactly as they did before", () => {
    // Transport and equipment intents have no unit at all. Two bare numbers
    // about the same intent are the same measure by construction.
    const reading = readCapacity({ quantity: 10, unitCode: null }, [
      allocation({ quantity: 4, unit: null, unitCode: null }),
    ]);
    expect(reading.remaining).toBe(6);
    expect(unmeasuredCount(reading.unmeasured)).toBe(0);
  });

  it("never goes negative", () => {
    expect(readCapacity({ quantity: 10, unitCode: null }, [
      allocation({ quantity: 18, unitCode: null }),
    ]).remaining).toBe(0);
  });

  // O. Divergence.
  it("reports the gap when an owner authorizes less than they already agreed", () => {
    const reading = readCapacity({ quantity: 15, unitCode: "METRIC_TONNE" }, [
      allocation({ quantity: 26, unitCode: "METRIC_TONNE" }),
    ]);
    expect(reading.remaining).toBe(0);
    expect(reading.overcommitted).toBe(11000);
  });

  it("spots divergence across units too", () => {
    // 20000 kg agreed against 15 tonnes authorized. Comparing the bare
    // numbers would have said 20 against 15 and been right by accident;
    // comparing 20000 kg against 15 tonnes would have said nothing was
    // wrong at all.
    const reading = readCapacity({ quantity: 15, unitCode: "METRIC_TONNE" }, [
      allocation({ quantity: 20000, unitCode: "KILOGRAM" }),
    ]);
    expect(reading.overcommitted).toBe(5000);
  });

  // N. Precision.
  it("does not manufacture overcommitment out of floating point noise", () => {
    // Ten agreements of 0.1 tonnes exactly fill a 1-tonne intent. Without
    // rounding at each conversion this leaves a few femtograms over and
    // reports the intent as overcommitted.
    const tenth = () => allocation({ quantity: 0.1, unitCode: "METRIC_TONNE" });
    const reading = readCapacity({ quantity: 1, unitCode: "METRIC_TONNE" }, [
      ...Array.from({ length: 10 }, tenth),
    ]);
    expect(reading.reserved).toBe(1000);
    expect(reading.remaining).toBe(0);
    expect(reading.overcommitted).toBe(0);
  });
});

describe("fitsWithin", () => {
  it("accepts an agreement that fits after conversion", () => {
    const reading = readCapacity(supply2t, []);
    expect(fitsWithin(reading, 1500, "KILOGRAM")).toMatchObject({ fits: true, canonical: 1500 });
  });

  it("rejects one that does not, whatever unit it is expressed in", () => {
    const reading = readCapacity(supply2t, []);
    // 3000 kg against 2 tonnes. Compared as bare numbers this is 3000
    // against 2 and rejected for the wrong reason; compared canonically it
    // is 3000 kg against 2000 kg and rejected for the right one.
    expect(fitsWithin(reading, 3000, "KILOGRAM")).toEqual({ fits: false, reason: "insufficient" });
  });

  it("accepts the agreement that exactly fills an intent", () => {
    // The tolerance exists for this: a conversion must never leave enough
    // dust behind to refuse a valid final allocation.
    const reading = readCapacity(supply2t, [allocation({ quantity: 1.9, unitCode: "METRIC_TONNE" })]);
    expect(fitsWithin(reading, 100, "KILOGRAM").fits).toBe(true);
  });

  it("treats an unmeasurable agreement as no quantity question at all", () => {
    // Bags against a tonnage reserve nothing, so there is nothing to check
    // — it appears in the diagnostics instead of being blocked or converted.
    const reading = readCapacity(supply2t, []);
    expect(fitsWithin(reading, 10, "BAG")).toMatchObject({ fits: true, canonical: null });
  });

  it("lets anything through an intent with no ceiling", () => {
    const reading = readCapacity({ quantity: null, unitCode: null }, []);
    expect(fitsWithin(reading, 999999, "KILOGRAM").fits).toBe(true);
  });
});

describe("hasRemainingCapacity", () => {
  it("treats unbounded as available and zero as not", () => {
    expect(hasRemainingCapacity(null)).toBe(true);
    expect(hasRemainingCapacity(12)).toBe(true);
    expect(hasRemainingCapacity(0)).toBe(false);
  });
});

describe("pairwiseQuantity", () => {
  const kg = UNITS.KILOGRAM;

  it("is bounded by whichever side has less left", () => {
    expect(
      pairwiseQuantity({ remaining: 12000, basis: kg }, { remaining: 30000, basis: kg }),
    ).toMatchObject({ value: 12000 });
  });

  it("meets across units", () => {
    // A supplier with 2 tonnes and a buyer needing 500 kg meet at 500 kg.
    expect(
      pairwiseQuantity({ remaining: 2000, basis: kg }, { remaining: 500, basis: kg }),
    ).toMatchObject({ value: 500, unit: kg });
  });

  it("does not require the two sides to be equal or even close", () => {
    // Partial fulfilment is how a 100-tonne order gets filled at all.
    expect(
      pairwiseQuantity({ remaining: 2000, basis: kg }, { remaining: 100000, basis: kg }),
    ).toMatchObject({ value: 2000 });
  });

  it("declines to invent a number across a package and a mass", () => {
    expect(
      pairwiseQuantity({ remaining: 12000, basis: kg }, { remaining: 30, basis: UNITS.BAG }),
    ).toBeNull();
  });

  it("declines across incompatible dimensions", () => {
    expect(
      pairwiseQuantity({ remaining: 100, basis: kg }, { remaining: 100, basis: UNITS.LITRE }),
    ).toBeNull();
  });

  it("declines to guess when either side is unbounded", () => {
    expect(pairwiseQuantity({ remaining: null, basis: null }, { remaining: 30, basis: kg })).toBeNull();
    expect(pairwiseQuantity({ remaining: 12, basis: kg }, { remaining: null, basis: null })).toBeNull();
  });

  it("pairs two unit-less intents as bare numbers", () => {
    expect(
      pairwiseQuantity({ remaining: 12, basis: null }, { remaining: 30, basis: null }),
    ).toMatchObject({ value: 12, unit: null });
  });

  it("has nothing to offer when a side is exhausted", () => {
    expect(pairwiseQuantity({ remaining: 0, basis: kg }, { remaining: 30, basis: kg })).toBeNull();
  });
});

describe("combinedRemaining", () => {
  it("adds what is genuinely still on the table", () => {
    // Not headline quantities: a supplier offering 40 who has agreed 35 of
    // them contributes 5, and counting 40 would tell a buyer their order was
    // covered when it is not.
    expect(combinedRemaining([30, 5, 12])).toEqual({ total: 47, unbounded: 0 });
  });

  it("keeps unbounded sides countable but out of the sum", () => {
    expect(combinedRemaining([30, null, 12])).toEqual({ total: 42, unbounded: 1 });
  });
});

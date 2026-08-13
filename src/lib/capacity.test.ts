import { describe, expect, it } from "vitest";
import {
  allocatedQuantity,
  combinedRemaining,
  consumesCapacity,
  hasRemainingCapacity,
  pairwiseQuantity,
  pairwiseUnit,
  remainingCapacity,
  unquantifiedAllocations,
  type Allocation,
} from "./capacity";

function allocation(overrides: Partial<Allocation> = {}): Allocation {
  return { status: "ACCEPTED", quantity: 8, unit: "tonne", ...overrides };
}

const supply20 = { quantity: 20, unit: "tonne" };

describe("consumesCapacity", () => {
  it("counts an agreed engagement and a completed one", () => {
    expect(consumesCapacity({ status: "ACCEPTED" })).toBe(true);
    expect(consumesCapacity({ status: "COMPLETED" })).toBe(true);
  });

  it("does not count a suggestion nobody answered", () => {
    // Forty suggestions against an intent have sold nothing.
    expect(consumesCapacity({ status: "SUGGESTED" })).toBe(false);
  });

  it("does not count a declined one, which is how capacity comes back", () => {
    expect(consumesCapacity({ status: "DECLINED" })).toBe(false);
  });

  it("does not count a trade someone said never happened", () => {
    expect(consumesCapacity({ status: "COMPLETED", fellThrough: true })).toBe(false);
  });
});

describe("allocatedQuantity", () => {
  it("sums what is actually spoken for", () => {
    expect(
      allocatedQuantity([allocation({ quantity: 8 }), allocation({ quantity: 5 })], "tonne"),
    ).toBe(13);
  });

  it("ignores engagements that do not consume", () => {
    expect(
      allocatedQuantity(
        [allocation({ status: "SUGGESTED" }), allocation({ status: "DECLINED" })],
        "tonne",
      ),
    ).toBe(0);
  });

  it("refuses to add quantities in units it cannot compare", () => {
    // 20 tonnes minus 1 "kg" is not 19 of anything. Adding the number
    // anyway would understate what is left by a factor of a thousand, and
    // the result would look entirely ordinary.
    expect(allocatedQuantity([allocation({ quantity: 1, unit: "kg" })], "tonne")).toBe(0);
  });

  it("reads plural and singular spellings as the same unit", () => {
    expect(allocatedQuantity([allocation({ quantity: 8, unit: "tonnes" })], "tonne")).toBe(8);
  });
});

describe("unquantifiedAllocations", () => {
  it("counts live engagements whose amount cannot be read", () => {
    const allocations = [
      allocation({ quantity: null }),
      allocation({ quantity: 1, unit: "kg" }),
      allocation({ quantity: 8 }),
      allocation({ status: "DECLINED", quantity: null }),
    ];
    // The null one and the incomparable one. Not the counted 8, and not the
    // declined one, which is not live at all.
    expect(unquantifiedAllocations(allocations, "tonne")).toBe(2);
  });
});

describe("remainingCapacity", () => {
  // B.
  it("is what is authorized minus what is allocated", () => {
    expect(remainingCapacity(supply20, [allocation({ quantity: 8 })])).toBe(12);
  });

  // D.
  it("subtracts several allocations", () => {
    expect(
      remainingCapacity(supply20, [allocation({ quantity: 8 }), allocation({ quantity: 5 })]),
    ).toBe(7);
  });

  // C. Allocation and commitment are the same number at different statuses.
  it("does not deduct the same quantity twice when it becomes a commitment", () => {
    const allocated = remainingCapacity(supply20, [
      allocation({ status: "ACCEPTED", quantity: 8 }),
    ]);
    const committed = remainingCapacity(supply20, [
      allocation({ status: "COMPLETED", quantity: 8 }),
    ]);
    expect(allocated).toBe(12);
    expect(committed).toBe(12);
  });

  // L.
  it("gives capacity back when an engagement is released", () => {
    expect(remainingCapacity(supply20, [allocation({ status: "DECLINED", quantity: 8 })])).toBe(20);
  });

  it("is unbounded, not empty, when nobody stated a quantity", () => {
    expect(remainingCapacity({ quantity: null, unit: null }, [])).toBeNull();
    expect(remainingCapacity({ quantity: null, unit: "tonne" }, [allocation()])).toBeNull();
  });

  it("never goes negative", () => {
    // A number below zero would read as "less than nothing available"
    // everywhere downstream. Fully spoken for is the honest floor.
    expect(remainingCapacity({ quantity: 10, unit: "tonne" }, [allocation({ quantity: 18 })])).toBe(0);
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
  it("is bounded by whichever side has less left", () => {
    // A supplier with 12 and a buyer needing 30 can do 12. Saying 30 would
    // promise the buyer something nobody has.
    expect(
      pairwiseQuantity({ remaining: 12, unit: "tonne" }, { remaining: 30, unit: "tonne" }),
    ).toBe(12);
  });

  it("does not require the two sides to be equal or even close", () => {
    // Partial fulfilment is how a 100-tonne order gets filled at all.
    expect(
      pairwiseQuantity({ remaining: 2, unit: "tonne" }, { remaining: 100, unit: "tonne" }),
    ).toBe(2);
  });

  it("declines to invent a number across units it cannot convert", () => {
    // FarmaTrade does not know how many kilograms are in a bag, and neither
    // does anyone else — a bag of maize and a bag of groundnuts differ.
    expect(
      pairwiseQuantity({ remaining: 12, unit: "tonne" }, { remaining: 30, unit: "bag" }),
    ).toBeNull();
  });

  it("declines to guess when either side stated no quantity", () => {
    expect(
      pairwiseQuantity({ remaining: null, unit: null }, { remaining: 30, unit: "tonne" }),
    ).toBeNull();
    expect(
      pairwiseQuantity({ remaining: 12, unit: "tonne" }, { remaining: null, unit: null }),
    ).toBeNull();
  });

  it("has nothing to offer when a side is exhausted", () => {
    expect(pairwiseQuantity({ remaining: 0, unit: "tonne" }, { remaining: 30, unit: "tonne" })).toBeNull();
  });
});

describe("pairwiseUnit", () => {
  it("takes whichever side actually named one", () => {
    expect(pairwiseUnit("tonnes", null)).toBe("tonne");
    expect(pairwiseUnit(null, "TONNE")).toBe("tonne");
    expect(pairwiseUnit(null, null)).toBeNull();
  });
});

describe("combinedRemaining", () => {
  it("adds what is genuinely still on the table", () => {
    // Not headline quantities: a supplier offering 40 who has engaged 35 of
    // them contributes 5, and counting 40 would tell a buyer their order was
    // covered when it is not.
    expect(combinedRemaining([30, 5, 12])).toEqual({ total: 47, unbounded: 0 });
  });

  it("keeps unbounded sides countable but out of the sum", () => {
    expect(combinedRemaining([30, null, 12])).toEqual({ total: 42, unbounded: 1 });
  });
});

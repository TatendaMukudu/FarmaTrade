import { describe, expect, it } from "vitest";
import { formatQuantity, pluralizeUnit, unitPerLabel } from "./units";

describe("pluralizeUnit", () => {
  it("pluralises the units that take an s", () => {
    expect(pluralizeUnit("TONNE", 3)).toBe("tonnes");
    expect(pluralizeUnit("BAG", 12)).toBe("bags");
    expect(pluralizeUnit("CRATE", 2)).toBe("crates");
    expect(pluralizeUnit("LITRE", 40)).toBe("litres");
  });

  it("leaves invariant units alone — '3 kgs' and '3 heads' are both wrong", () => {
    expect(pluralizeUnit("KG", 500)).toBe("kg");
    expect(pluralizeUnit("HEAD", 12)).toBe("head");
  });

  it("keeps the singular for exactly one", () => {
    expect(pluralizeUnit("TONNE", 1)).toBe("tonne");
    expect(pluralizeUnit("CRATE", 1)).toBe("crate");
  });

  it("leaves a unit we don't know exactly as the farmer typed it", () => {
    // Post.unit is free text. Guessing a plural risks inventing something
    // wrong inside a listing title other farmers read.
    expect(pluralizeUnit("punnet", 5)).toBe("punnet");
    expect(pluralizeUnit("Sack", 5)).toBe("sack");
  });

  it("handles a blank unit without producing a stray space", () => {
    expect(pluralizeUnit("", 3)).toBe("");
    expect(pluralizeUnit("   ", 3)).toBe("");
  });
});

describe("formatQuantity", () => {
  it("is the bug this module exists for", () => {
    // The dashboard and auto-drafted listing titles both said "3 tonne".
    expect(formatQuantity(3, "TONNE")).toBe("3 tonnes");
  });

  it("joins a quantity to its unit correctly across the range", () => {
    expect(formatQuantity(1, "TONNE")).toBe("1 tonne");
    expect(formatQuantity(12, "HEAD")).toBe("12 head");
    expect(formatQuantity(500, "KG")).toBe("500 kg");
    expect(formatQuantity(2.5, "TONNE")).toBe("2.5 tonnes");
  });

  it("returns just the number when there is no unit", () => {
    expect(formatQuantity(8, null)).toBe("8");
    expect(formatQuantity(8, "")).toBe("8");
    expect(formatQuantity(8, undefined)).toBe("8");
  });
});

describe("unitPerLabel", () => {
  it("stays singular, since 'per' is singular whatever the number", () => {
    expect(unitPerLabel("TONNE")).toBe("tonne");
    expect(unitPerLabel("CRATE")).toBe("crate");
  });
});

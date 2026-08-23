import { describe, expect, it } from "vitest";
import {
  BASE_UNIT,
  PRODUCE_UNIT_CANONICAL,
  QUANTITY_EPSILON,
  UNITS,
  comparability,
  convertQuantity,
  coversQuantity,
  formatCanonical,
  knownAliases,
  normalizeTerm,
  quantitiesEqual,
  resolveUnit,
  sameBasis,
  toCanonical,
  unitByCode,
  type UnitCode,
} from "./measurement";
import { PRODUCE_UNIT } from "./enums";

const unit = (code: UnitCode) => UNITS[code];

// A. Alias identity.
describe("resolveUnit", () => {
  it("resolves every spelling of the tonne to one identity", () => {
    for (const term of ["tonne", "tonnes", "t", "T", " Tonnes ", "metric ton", "metric tonnes", "mt"]) {
      const resolved = resolveUnit(term);
      expect(resolved.ok, term).toBe(true);
      if (resolved.ok) expect(resolved.unit.code, term).toBe("METRIC_TONNE");
    }
  });

  it("resolves every spelling of the kilogram to one identity", () => {
    for (const term of ["kg", "KG", "kgs", "kilo", "kilos", "kilogram", "kilograms", "kg."]) {
      const resolved = resolveUnit(term);
      expect(resolved.ok, term).toBe(true);
      if (resolved.ok) expect(resolved.unit.code, term).toBe("KILOGRAM");
    }
  });

  // K. Typo safety.
  it("refuses a near miss rather than correcting it", () => {
    // "tone" is one character from "tonne" and any edit-distance matcher
    // would take it. Guessing here is guessing at the size of a trade.
    for (const typo of ["tone", "tonn", "kgg", "littre", "tonnes maize"]) {
      expect(resolveUnit(typo), typo).toMatchObject({ ok: false, reason: "unknown_unit" });
    }
  });

  // J. Unknown unit.
  it("leaves a genuinely unknown unit unresolved", () => {
    for (const term of ["punnet", "sack", "bale", "bucket", "tray", "wheelbarrow"]) {
      expect(resolveUnit(term), term).toMatchObject({ ok: false, reason: "unknown_unit" });
    }
  });

  it("does not map the short ton, so anybody who means one is told", () => {
    // `ton` alone is metric here because every market FarmaTrade serves is.
    // Somebody who writes "short ton" means something 10% different and
    // must not have it silently rounded into a tonne.
    expect(resolveUnit("short ton")).toMatchObject({ ok: false, reason: "unknown_unit" });
    expect(resolveUnit("long ton")).toMatchObject({ ok: false, reason: "unknown_unit" });
    expect(resolveUnit("ton")).toMatchObject({ ok: true });
  });

  it("distinguishes an unstated unit from an unrecognised one", () => {
    // "no unit given" and "a unit I do not know" are different facts and
    // callers treat them differently.
    expect(resolveUnit(null)).toEqual({ ok: false, reason: "unstated" });
    expect(resolveUnit("   ")).toEqual({ ok: false, reason: "unstated" });
  });
});

describe("normalizeTerm", () => {
  it("normalizes only what is safe", () => {
    expect(normalizeTerm("  Metric   Tonnes  ")).toBe("metric tonnes");
    expect(normalizeTerm("KG.")).toBe("kg");
  });

  it("does not strip plurals by rule", () => {
    // Every plural is an explicit alias. A trailing-s rule turns "gas" into
    // "ga" and is the sort of cleverness that produces a wrong tonnage.
    expect(normalizeTerm("tonnes")).toBe("tonnes");
  });
});

describe("the alias table", () => {
  it("gives every alias exactly one meaning", () => {
    // The database-level guarantee ProductAlias gets from a unique index.
    // A closed code-defined set gets it here instead, checked at build time
    // rather than at insert time.
    const seen = new Map<string, UnitCode>();
    for (const [term, code] of knownAliases()) {
      expect(seen.has(term), `duplicate alias: ${term}`).toBe(false);
      seen.set(term, code);
    }
  });

  it("stores every alias already normalized, so lookup is exact", () => {
    for (const [term] of knownAliases()) {
      expect(normalizeTerm(term), term).toBe(term);
    }
  });

  it("points every alias at a unit that exists", () => {
    for (const [term, code] of knownAliases()) {
      expect(UNITS[code], term).toBeDefined();
    }
  });

  it("gives every canonical unit at least one way to be typed", () => {
    const reachable = new Set(knownAliases().map(([, code]) => code));
    for (const code of Object.keys(UNITS) as UnitCode[]) {
      expect(reachable.has(code), code).toBe(true);
    }
  });
});

describe("dimensions", () => {
  it("gives every convertible dimension a base unit, and packages none", () => {
    expect(BASE_UNIT.MASS).toBe("KILOGRAM");
    expect(BASE_UNIT.VOLUME).toBe("LITRE");
    expect(BASE_UNIT.COUNT).toBe("EACH");
    // The absence is the invariant. A base unit for PACKAGE would be a
    // claim that all packages are commensurable.
    expect(BASE_UNIT.PACKAGE).toBeNull();
  });

  it("gives every package unit a null factor and every other unit a real one", () => {
    for (const u of Object.values(UNITS)) {
      if (u.dimension === "PACKAGE") expect(u.factor, u.code).toBeNull();
      else expect(u.factor, u.code).toBeGreaterThan(0);
    }
  });
});

// B, C. Exact conversion, both directions.
describe("convertQuantity", () => {
  it("converts 1000 kg to exactly 1 tonne", () => {
    expect(convertQuantity(1000, unit("KILOGRAM"), unit("METRIC_TONNE"))).toMatchObject({
      ok: true,
      value: 1,
    });
  });

  it("converts 0.5 tonne to exactly 500 kg", () => {
    expect(convertQuantity(0.5, unit("METRIC_TONNE"), unit("KILOGRAM"))).toMatchObject({
      ok: true,
      value: 500,
    });
  });

  it("returns a same-unit conversion untouched", () => {
    expect(convertQuantity(26, unit("METRIC_TONNE"), unit("METRIC_TONNE"))).toMatchObject({
      ok: true,
      value: 26,
    });
  });

  it("converts head and each freely, because one head is one animal", () => {
    expect(convertQuantity(12, unit("HEAD"), unit("EACH"))).toMatchObject({ ok: true, value: 12 });
  });

  // H. Package safety.
  it("never turns a bag into a mass", () => {
    // A bag of maize and a bag of groundnuts are different weights, and so
    // are two different sacks of the same maize. There is no number to
    // return here and returning one anyway is the failure mode this whole
    // module exists to prevent.
    expect(convertQuantity(1, unit("BAG"), unit("KILOGRAM"))).toMatchObject({
      ok: false,
      reason: "context_required",
    });
    expect(convertQuantity(10, unit("BAG"), unit("METRIC_TONNE"))).toMatchObject({
      ok: false,
      reason: "context_required",
    });
  });

  it("never turns a bag into a crate either", () => {
    // Converting between two packages needs both package sizes, which is
    // twice the missing information, not zero.
    expect(convertQuantity(10, unit("BAG"), unit("CRATE"))).toMatchObject({
      ok: false,
      reason: "context_required",
    });
  });

  // I. Dimensional incompatibility.
  it("never converts mass to volume", () => {
    // Density is a property of a substance. FarmaTrade does not model
    // substances at that level and must not pretend otherwise.
    expect(convertQuantity(100, unit("KILOGRAM"), unit("LITRE"))).toMatchObject({
      ok: false,
      reason: "incompatible_dimension",
      from: "MASS",
      to: "VOLUME",
    });
  });

  it("never converts a count to a mass", () => {
    expect(convertQuantity(12, unit("HEAD"), unit("KILOGRAM"))).toMatchObject({
      ok: false,
      reason: "incompatible_dimension",
    });
  });

  it("never returns zero or the input to signal failure", () => {
    // A silent zero reads as "nothing reserved" and a silent passthrough
    // reads as "1 bag is 1 kg". Both are worse than an error.
    const failed = convertQuantity(10, unit("BAG"), unit("KILOGRAM"));
    expect(failed.ok).toBe(false);
    expect(failed).not.toHaveProperty("value");
  });
});

describe("comparability", () => {
  it("names the four outcomes distinctly", () => {
    expect(comparability(unit("METRIC_TONNE"), unit("METRIC_TONNE")).kind).toBe("same_unit");
    expect(comparability(unit("METRIC_TONNE"), unit("KILOGRAM")).kind).toBe("convertible");
    expect(comparability(unit("KILOGRAM"), unit("LITRE"))).toMatchObject({
      reason: "incompatible_dimension",
    });
    expect(comparability(unit("BAG"), unit("KILOGRAM"))).toMatchObject({
      reason: "context_required",
    });
  });
});

describe("toCanonical", () => {
  it("puts mass in kilograms", () => {
    expect(toCanonical(2, unit("METRIC_TONNE"))).toMatchObject({ value: 2000, dimension: "MASS" });
  });

  it("leaves a package as itself, which is its canonical form", () => {
    const canonical = toCanonical(10, unit("BAG"));
    expect(canonical).toMatchObject({ value: 10, dimension: "PACKAGE" });
    expect(canonical.unit.code).toBe("BAG");
  });
});

describe("sameBasis", () => {
  it("adds masses together whatever they were typed in", () => {
    expect(sameBasis(toCanonical(2, unit("METRIC_TONNE")), toCanonical(500, unit("KILOGRAM")))).toBe(
      true,
    );
  });

  it("keeps two different packages apart", () => {
    expect(sameBasis(toCanonical(10, unit("BAG")), toCanonical(10, unit("CRATE")))).toBe(false);
  });

  it("lets bags add to bags", () => {
    expect(sameBasis(toCanonical(10, unit("BAG")), toCanonical(5, unit("BAG")))).toBe(true);
  });

  it("keeps mass and volume apart", () => {
    expect(sameBasis(toCanonical(1, unit("KILOGRAM")), toCanonical(1, unit("LITRE")))).toBe(false);
  });
});

// N. Precision.
describe("precision", () => {
  it("does not leave floating point noise behind after a conversion", () => {
    // 0.1 * 1000 is 100.00000000000001 in IEEE arithmetic. Left alone it
    // becomes phantom overcommitment the first time it is subtracted.
    const converted = convertQuantity(0.1, unit("METRIC_TONNE"), unit("KILOGRAM"));
    expect(converted.ok && converted.value).toBe(100);
  });

  it("keeps a mixed-unit subtraction exact", () => {
    const authorized = toCanonical(2, unit("METRIC_TONNE")).value;
    const first = toCanonical(750, unit("KILOGRAM")).value;
    const second = toCanonical(0.5, unit("METRIC_TONNE")).value;
    expect(authorized - first - second).toBe(750);
  });

  it("treats a microgram of drift as equality", () => {
    expect(quantitiesEqual(750, 750 + QUANTITY_EPSILON / 2)).toBe(true);
    expect(quantitiesEqual(750, 750.1)).toBe(false);
  });

  it("does not reject a final allocation over invisible drift", () => {
    // The exact failure this tolerance exists for: the last agreement that
    // fills an intent must not be refused because a conversion left
    // 0.0000000002 behind.
    expect(coversQuantity(1000 - 1e-12, 1000)).toBe(true);
    expect(coversQuantity(999.9, 1000)).toBe(false);
  });

  it("survives thirds without accumulating error", () => {
    const third = convertQuantity(1 / 3, unit("METRIC_TONNE"), unit("KILOGRAM"));
    expect(third.ok && third.value).toBeCloseTo(333.333333, 6);
  });
});

// L. ProduceStock reconciliation.
describe("PRODUCE_UNIT_CANONICAL", () => {
  it("maps every ProduceUnit the enum can hold", () => {
    // Inventory's vocabulary and commerce's canonical identity are two ends
    // of one pipeline. Every value maps, and the Record type means a new
    // enum value cannot be added without one.
    for (const value of PRODUCE_UNIT) {
      const code = PRODUCE_UNIT_CANONICAL[value];
      expect(code, value).toBeDefined();
      expect(UNITS[code], value).toBeDefined();
    }
    expect(Object.keys(PRODUCE_UNIT_CANONICAL).sort()).toEqual([...PRODUCE_UNIT].sort());
  });

  it("keeps the enum's packaging values as packages", () => {
    expect(UNITS[PRODUCE_UNIT_CANONICAL.BAG].dimension).toBe("PACKAGE");
    expect(UNITS[PRODUCE_UNIT_CANONICAL.CRATE].dimension).toBe("PACKAGE");
  });

  it("agrees with what the alias table resolves the enum's own labels to", () => {
    // The enum labels are words a farmer sees, so they must resolve the
    // same way whether they arrive from inventory or from a text field.
    for (const value of PRODUCE_UNIT) {
      const viaAlias = resolveUnit(value);
      expect(viaAlias.ok, value).toBe(true);
      if (viaAlias.ok) expect(viaAlias.unit.code, value).toBe(PRODUCE_UNIT_CANONICAL[value]);
    }
  });
});

// M. Stability of stored identity.
describe("unitByCode", () => {
  it("reads a stored code back to the same physical meaning", () => {
    // What an old agreement meant is fixed by the code stored on it, not by
    // whatever aliases or display names exist later.
    expect(unitByCode("METRIC_TONNE")?.factor).toBe(1000);
    expect(unitByCode("KILOGRAM")?.factor).toBe(1);
  });

  it("returns nothing for a code it does not know, rather than a default", () => {
    expect(unitByCode("FURLONG")).toBeNull();
    expect(unitByCode(null)).toBeNull();
  });
});

describe("formatCanonical", () => {
  it("writes a quantity the way a person does", () => {
    expect(formatCanonical(1, unit("METRIC_TONNE"))).toBe("1 tonne");
    expect(formatCanonical(2.5, unit("METRIC_TONNE"))).toBe("2.5 tonnes");
    expect(formatCanonical(500, unit("KILOGRAM"))).toBe("500 kg");
    expect(formatCanonical(12, unit("HEAD"))).toBe("12 head");
    expect(formatCanonical(10, unit("BAG"))).toBe("10 bags");
  });
});

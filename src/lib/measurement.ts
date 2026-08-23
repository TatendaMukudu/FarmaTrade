// Canonical measurement: what a quantity actually means, independent of the
// word a farmer typed.
//
// Three concepts, and collapsing any two of them is how a system starts
// quietly lying about tonnage:
//
//   UNIT IDENTITY   "tonne", "tonnes", "t" and "metric ton" are one unit
//   DIMENSION       kilogram and metric tonne both measure MASS
//   CONTEXT         a bag is a bag; how much it weighs depends on the deal
//
// The third is the one that matters most. 1000 kg is a metric tonne
// everywhere and always. "1 bag = 50 kg" is true of some maize in some
// districts and false of groundnuts, of a different sack, of a different
// season. A system that hard-codes it will one day tell a farmer that ten
// bags fit inside a tonne they have already sold. So bags convert to
// nothing, and FarmaTrade says so out loud rather than picking a number.
//
// Everything here is code, not data. Units are closed-world physics and a
// small closed set; products are open-world and live in the database
// because farmers keep inventing them (see products.ts). A conversion
// factor that an admin could edit is a conversion factor that can silently
// change what a completed trade meant, so the factors are constants and the
// alias table is exhaustively checked by a test rather than by a unique
// index.
//
// No fuzzy matching. No AI. No locale rules that change physical meaning.
// A term that is not in the table stays unknown, visibly.
//
// Pure and DB-free.

// The physical properties FarmaTrade currently needs to reason about.
//
// Derived from what is actually in the repository — the ProduceUnit enum,
// the unit strings in seeds and fixtures, and the free text intents carry —
// not from a survey of what a units library usually has.
//
// AREA is deliberately absent. The only area in the system is
// Farm.sizeHectares, which is a self-describing profile scalar that is
// never compared with anything or converted; giving it a dimension would be
// building infrastructure for a comparison nobody makes.
export type Dimension =
  | "MASS"
  | "VOLUME"
  | "COUNT"
  // Packaging: countable containers whose contents are not implied by the
  // container. Its own dimension precisely so that nothing in this module
  // can convert it into MASS by accident.
  | "PACKAGE";

export type UnitCode =
  | "KILOGRAM"
  | "METRIC_TONNE"
  | "LITRE"
  | "EACH"
  | "HEAD"
  | "BAG"
  | "CRATE";

export type CanonicalUnit = {
  code: UnitCode;
  dimension: Dimension;
  // How many base units one of these is. Null for PACKAGE units, which have
  // no factor because there is no honest one — that null is the mechanism
  // that makes a bag refuse to become a mass.
  factor: number | null;
  // Singular and plural, for putting a number back in front of a person.
  one: string;
  many: string;
};

// The base unit each convertible dimension is compared in.
//
// Kilogram over gram because agricultural trade is done in kilograms and
// tonnes, and a base of grams would make every stored canonical figure
// three orders of magnitude larger for no gain. Litre and each for the same
// reason: they are what people already say.
export const BASE_UNIT: Record<Dimension, UnitCode | null> = {
  MASS: "KILOGRAM",
  VOLUME: "LITRE",
  COUNT: "EACH",
  // No base. Packages are comparable to themselves and to nothing else.
  PACKAGE: null,
};

export const UNITS: Record<UnitCode, CanonicalUnit> = {
  KILOGRAM: { code: "KILOGRAM", dimension: "MASS", factor: 1, one: "kg", many: "kg" },
  METRIC_TONNE: { code: "METRIC_TONNE", dimension: "MASS", factor: 1000, one: "tonne", many: "tonnes" },
  LITRE: { code: "LITRE", dimension: "VOLUME", factor: 1, one: "litre", many: "litres" },
  EACH: { code: "EACH", dimension: "COUNT", factor: 1, one: "unit", many: "units" },
  // One head is one animal, so it converts freely with EACH. Kept as its
  // own unit anyway: "12 head" is what a farmer says about cattle and
  // "12 units" is not, and display should not be the price of comparison.
  HEAD: { code: "HEAD", dimension: "COUNT", factor: 1, one: "head", many: "head" },
  BAG: { code: "BAG", dimension: "PACKAGE", factor: null, one: "bag", many: "bags" },
  CRATE: { code: "CRATE", dimension: "PACKAGE", factor: null, one: "crate", many: "crates" },
};

// Every term FarmaTrade will resolve, and nothing else.
//
// Sourced from what the repository actually contains — the ProduceUnit enum
// values, the strings in seed data and fixtures, and ordinary spellings of
// those same words — plus the abbreviations a farmer typing on a phone will
// obviously reach for.
//
// `ton` and `tons` map to the metric tonne. That is a regional judgement
// and worth stating plainly: every market FarmaTrade operates in (ZW, ZA,
// KE, ZM, MW) is metric, the schema's own enum says TONNE, and the short
// ton appears nowhere in the data. "short ton" and "long ton" are
// deliberately absent so that anyone who genuinely means one gets an
// unresolved unit rather than a silent 10% error.
//
// "sack", "punnet", "bale", "bucket", "tray" are also absent, though
// units.ts has long mentioned them as things a farmer might type. A sack is
// not reliably a bag, and mapping it to BAG would let ten sacks and five
// bags be added together as though they were the same container. They stay
// unresolved until somebody has evidence.
const ALIASES: Record<string, UnitCode> = {
  kg: "KILOGRAM",
  kgs: "KILOGRAM",
  kilo: "KILOGRAM",
  kilos: "KILOGRAM",
  kilogram: "KILOGRAM",
  kilograms: "KILOGRAM",

  t: "METRIC_TONNE",
  ton: "METRIC_TONNE",
  tons: "METRIC_TONNE",
  tonne: "METRIC_TONNE",
  tonnes: "METRIC_TONNE",
  mt: "METRIC_TONNE",
  "metric ton": "METRIC_TONNE",
  "metric tons": "METRIC_TONNE",
  "metric tonne": "METRIC_TONNE",
  "metric tonnes": "METRIC_TONNE",

  l: "LITRE",
  litre: "LITRE",
  litres: "LITRE",
  liter: "LITRE",
  liters: "LITRE",

  each: "EACH",
  ea: "EACH",
  unit: "EACH",
  units: "EACH",
  piece: "EACH",
  pieces: "EACH",

  head: "HEAD",
  heads: "HEAD",

  bag: "BAG",
  bags: "BAG",

  crate: "CRATE",
  crates: "CRATE",
};

// The spelling a term is looked up under.
//
// Trim, lowercase, collapse internal whitespace, drop a trailing full stop
// ("kg." is a person writing an abbreviation). Deliberately nothing else:
// no plural stripping, no edit distance, no character substitution. Every
// plural FarmaTrade accepts is an explicit row above, because a rule that
// strips a trailing "s" turns "gas" into "ga" and "tons" into "ton" by
// accident rather than by decision.
export function normalizeTerm(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");
}

export type UnitResolution =
  | { ok: true; unit: CanonicalUnit }
  | { ok: false; reason: "unknown_unit"; term: string }
  | { ok: false; reason: "unstated" };

// A user-facing term to a canonical unit, or an honest failure.
//
// Exact lookup only. A typo like "tonne" written "tone" resolves to
// nothing, which is the point: silently correcting it would mean guessing
// what somebody meant about the size of a trade.
export function resolveUnit(term: string | null | undefined): UnitResolution {
  const normalized = term == null ? "" : normalizeTerm(term);
  if (!normalized) return { ok: false, reason: "unstated" };
  const code = ALIASES[normalized];
  if (!code) return { ok: false, reason: "unknown_unit", term: normalized };
  return { ok: true, unit: UNITS[code] };
}

// A stored canonical code back to its unit. Stored codes are written by
// this module and never by a person, so an unrecognised one is a bug rather
// than an input error — but it still fails visibly rather than defaulting.
export function unitByCode(code: string | null | undefined): CanonicalUnit | null {
  if (!code) return null;
  return UNITS[code as UnitCode] ?? null;
}

// Why two quantities could not be brought into the same terms.
export type ComparisonFailure =
  | { reason: "unknown_unit"; term: string }
  | { reason: "incompatible_dimension"; from: Dimension; to: Dimension }
  | { reason: "context_required"; from: UnitCode; to: UnitCode };

export type Comparability =
  | { kind: "same_unit"; unit: CanonicalUnit }
  | { kind: "convertible"; factor: number }
  | ({ kind: "unavailable" } & ComparisonFailure);

// Whether two canonical units can be brought into the same terms, and how.
//
// The four outcomes are genuinely different questions and callers need to
// tell them apart:
//
//   same_unit               tonnes and tonnes
//   convertible             tonnes and kilograms, by a physical constant
//   incompatible_dimension  kilograms and litres — mass is not volume, and
//                           density is a property of a substance that
//                           FarmaTrade does not model
//   context_required        bags and kilograms, or bags and crates — a real
//                           conversion may exist for a particular deal, but
//                           it is not a fact about the words
export function comparability(from: CanonicalUnit, to: CanonicalUnit): Comparability {
  if (from.code === to.code) return { kind: "same_unit", unit: from };

  if (from.dimension === "PACKAGE" || to.dimension === "PACKAGE") {
    return { kind: "unavailable", reason: "context_required", from: from.code, to: to.code };
  }

  if (from.dimension !== to.dimension) {
    return {
      kind: "unavailable",
      reason: "incompatible_dimension",
      from: from.dimension,
      to: to.dimension,
    };
  }

  // Both convertible dimensions and both non-package, so both have factors.
  return { kind: "convertible", factor: from.factor! / to.factor! };
}

// Rounding applied to every converted figure.
//
// Six decimal places on a kilogram base is a milligram, which is finer than
// any agricultural trade will ever care about and coarse enough to erase
// IEEE noise: 0.1 tonnes is 100.00000000000001 kg before this and exactly
// 100 after.
//
// Chosen over migrating every quantity column to Decimal. That migration
// would touch Intent, ProduceStock, AgreementTerms and Match, and would buy
// exactness in a domain where the inputs are themselves estimates — a
// farmer's "about 26 tonnes" is not a figure that deserves arbitrary
// precision. What it would genuinely buy is protection against accumulated
// drift over many conversions, and that is bounded here instead by rounding
// at every conversion rather than only at the end.
const CANONICAL_DP = 6;

function round(value: number): number {
  return Math.round(value * 10 ** CANONICAL_DP) / 10 ** CANONICAL_DP;
}

// How close two canonical quantities must be to count as equal.
//
// Commercial capacity must never refuse a valid final allocation because a
// conversion left 0.0000000002 behind. A microgram of slack against a
// kilogram base is invisible commercially and decisive numerically.
export const QUANTITY_EPSILON = 1e-6;

export function quantitiesEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= QUANTITY_EPSILON;
}

// Whether `available` covers `required`, tolerantly.
export function coversQuantity(available: number, required: number): boolean {
  return available - required >= -QUANTITY_EPSILON;
}

export type ConversionResult =
  | { ok: true; value: number; unit: CanonicalUnit }
  | ({ ok: false } & ComparisonFailure);

// THE conversion primitive. Everything that needs one number expressed in
// another unit comes through here.
//
// It never returns zero to mean failure, never returns the input unchanged,
// and never guesses. A caller that cannot handle a failure has to say so.
export function convertQuantity(
  value: number,
  from: CanonicalUnit,
  to: CanonicalUnit,
): ConversionResult {
  const how = comparability(from, to);
  if (how.kind === "unavailable") return { ok: false, ...how };
  if (how.kind === "same_unit") return { ok: true, value, unit: to };
  return { ok: true, value: round(value * how.factor), unit: to };
}

// A quantity in the base unit of its own dimension — the form all capacity
// arithmetic happens in.
//
// PACKAGE units have no base, so they are returned as themselves. Ten bags
// is ten bags: comparable with other bags, and with nothing else. That is
// not a failure, it is the correct canonical form for a package.
export type CanonicalQuantity = {
  value: number;
  unit: CanonicalUnit;
  dimension: Dimension;
};

export function toCanonical(value: number, unit: CanonicalUnit): CanonicalQuantity {
  const base = BASE_UNIT[unit.dimension];
  if (base == null) return { value, unit, dimension: unit.dimension };
  const converted = convertQuantity(value, unit, UNITS[base]);
  // Cannot fail: same dimension, both non-package.
  return {
    value: converted.ok ? converted.value : value,
    unit: UNITS[base],
    dimension: unit.dimension,
  };
}

// Two canonical quantities are addable when they are in the same dimension
// AND, for packages, the very same unit.
export function sameBasis(a: CanonicalQuantity, b: CanonicalQuantity): boolean {
  if (a.dimension !== b.dimension) return false;
  if (a.dimension === "PACKAGE") return a.unit.code === b.unit.code;
  return true;
}

// A number and a unit, written the way a person writes them.
//
// Display only. Commercial arithmetic happens on canonical quantities and
// never on this string — keeping the two apart is what stops a rendering
// decision becoming a pricing one.
export function formatCanonical(value: number, unit: CanonicalUnit): string {
  const rounded = round(value);
  const word = rounded === 1 ? unit.one : unit.many;
  return `${rounded} ${word}`;
}

// The ProduceUnit enum, mapped onto canonical identity.
//
// Inventory has always used a closed enum while intents used free text —
// the two ends of the same pipeline with different vocabularies. Rather
// than migrating the enum away, this is the bridge: a TOTAL function, and
// total is the operative word. The Record type makes TypeScript reject the
// build if a ProduceUnit value is ever added without a canonical meaning,
// so the mapping cannot quietly fall out of date.
//
// Every one of the six is deterministic. KG and TONNE are mass, LITRE is
// volume, HEAD is a count of animals, and BAG and CRATE stay packages that
// convert to nothing — the enum was never claiming a bag had a weight
// either.
//
// The enum therefore stays as inventory's input vocabulary and needs no
// migration. What changes is that it is no longer a second canonical
// system: it is a set of labels with a proven mapping into the only one.
export const PRODUCE_UNIT_CANONICAL: Record<
  "KG" | "TONNE" | "BAG" | "CRATE" | "LITRE" | "HEAD",
  UnitCode
> = {
  KG: "KILOGRAM",
  TONNE: "METRIC_TONNE",
  BAG: "BAG",
  CRATE: "CRATE",
  LITRE: "LITRE",
  HEAD: "HEAD",
};

// Every alias, for the exhaustiveness test and for anything that needs to
// show a farmer what FarmaTrade understands.
export function knownAliases(): ReadonlyArray<[string, UnitCode]> {
  return Object.entries(ALIASES) as [string, UnitCode][];
}

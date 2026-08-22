// Units, written the way a person writes them.
//
// Every place a quantity met a unit did `unit.toLowerCase()` and stopped
// there, so the app said "3 tonne of Oranges" — on the dashboard, and more
// damagingly inside auto-drafted listing *titles*, which is text other
// farmers read when deciding whether to trade with you. Small, but it is the
// kind of wrongness that makes software look unserious in exactly the moment
// it is asking to be trusted with a real transaction.
//
// Not every unit pluralises. "3 kgs" and "3 heads of cattle" are both wrong,
// so this is a table rather than a rule with an "s" bolted on.
//
// Pure and DB-free.

// The plural of each ProduceUnit. A unit that is invariant maps to itself,
// which is a fact about the word and not an oversight.
const PLURALS: Record<string, string> = {
  kg: "kg",
  tonne: "tonnes",
  bag: "bags",
  crate: "crates",
  litre: "litres",
  head: "head",
};

// Intent.unit is free text — a farmer can type "punnet", "bale", "sack",
// whatever their trade actually uses. Guessing a plural for a word we don't
// know risks inventing something wrong in a listing title, so an unknown
// unit is left exactly as the farmer wrote it.
export function pluralizeUnit(unit: string, quantity: number): string {
  const normalized = unit.trim().toLowerCase();
  if (!normalized) return "";
  if (quantity === 1) return normalized;
  return PLURALS[normalized] ?? normalized;
}

// "3 tonnes", "1 tonne", "12 head", "500 kg". The single place a quantity
// and a unit get joined.
export function formatQuantity(quantity: number, unit: string | null | undefined): string {
  const amount = Number.isInteger(quantity) ? String(quantity) : String(quantity);
  if (!unit?.trim()) return amount;
  return `${amount} ${pluralizeUnit(unit, quantity)}`;
}

// The singular form, for phrasing that is grammatically singular whatever
// the number — "asking $290 per tonne", never "per tonnes".
export function unitPerLabel(unit: string): string {
  return unit.trim().toLowerCase();
}

// The plural forms above, read backwards, so "tonnes" and "tonne" are the
// same unit. Built from PLURALS rather than written twice, because a table
// that can disagree with itself eventually will.
const SINGULARS: Record<string, string> = Object.fromEntries(
  Object.entries(PLURALS).map(([singular, plural]) => [plural, singular]),
);

// One spelling per unit, so "Tonnes", "tonne " and "tonnes" are recognised
// as the same thing. This is normalization, NOT conversion: it changes how a
// unit is written and never what it measures.
export function normalizeUnit(unit: string | null | undefined): string | null {
  const trimmed = unit?.trim().toLowerCase();
  if (!trimmed) return null;
  return SINGULARS[trimmed] ?? trimmed;
}

// Whether two quantities may be compared or subtracted at all.
//
// FarmaTrade has no conversion table. It does not know how many kilograms a
// bag holds, and the honest answer is that nobody does — a bag of maize and
// a bag of groundnuts are different weights, and a farmer's "sack" is
// whatever their trade means by it. So this is deliberately strict equality
// on the normalized spelling rather than a lookup that would be wrong for
// most of the produce on the network.
//
// A missing unit on either side is treated as comparable: an intent for "20"
// with no unit and one for "20 tonnes" are almost certainly about the same
// measure, and the alternative — refusing to engage at all — would break
// every intent recorded before units were asked for.
//
// The conversion layer this defers is real work, not an oversight. It needs
// per-product densities and per-region container sizes, and it belongs
// after quantity semantics are trustworthy, not tangled into them. Until it
// exists, mismatched units produce an unquantified engagement rather than a
// number that looks precise and is wrong.
export function unitsComparable(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeUnit(a);
  const right = normalizeUnit(b);
  if (left === null || right === null) return true;
  return left === right;
}

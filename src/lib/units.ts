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

// Post.unit is free text — a farmer can type "punnet", "bale", "sack",
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

// What a price means, and what a deal is therefore worth.
//
// FarmaTrade stored `askingPrice: 500` and nothing else, and two modules
// read that number in contradictory ways:
//
//   estimatedIntentValue   price × quantity   — treating 500 as a rate
//   loadPriceSignals       price ÷ quantity   — treating 500 as a total
//
// Both cannot be right, and the form only ever said "Price (optional)", so
// the data itself is of genuinely mixed meaning. This module makes the
// meaning explicit going forward and refuses to guess it backwards.
//
// Three things are kept apart, and collapsing any two of them silently
// changes what somebody is owed:
//
//   TOTAL         500 USD for this deal. Quantity does not scale it.
//   PER UNIT      500 USD per tonne. Scales with the agreed quantity,
//                 through P0.5's conversion and nothing else.
//   PER PACKAGE   20 USD per bag. Scales with the number of BAGS.
//
// The last is the subtle one. Even if a package's mass were known — 1 bag =
// 50 kg — that would establish how much a bag WEIGHS. It would not turn
// "20 USD per bag" into "0.40 USD per kg" as far as the parties are
// concerned: they agreed a price per bag, and ten bags is 200 USD whether
// or not anybody can weigh them. Package equivalence is a quantity fact and
// must never be allowed to rewrite a price basis.
//
// Pure and DB-free.

import {
  convertQuantity,
  unitByCode,
  type CanonicalUnit,
} from "@/lib/measurement";
import {
  moneyFromMajor,
  multiplyMoney,
  type Currency,
  type Money,
} from "@/lib/money";

// What the number is a price *of*.
//
// Two values, because these are the only two shapes a farmer actually
// quotes. "Per bag" is not a third: it is PER_UNIT whose basis unit happens
// to be a package, which is exactly why package pricing needs no special
// case in the arithmetic below.
export type PriceBasis = "TOTAL" | "PER_UNIT";

// A price whose meaning is fully determined.
export type ResolvedPrice = {
  money: Money;
  basis: PriceBasis;
  // The unit the rate is per. Null for TOTAL, required for PER_UNIT — a
  // rate without a basis unit is the ambiguity this module exists to end.
  perUnit: CanonicalUnit | null;
};

// A price as it comes out of the database, before anything is known about
// it. Any field may be missing, and missing fields are why a value can be
// unresolvable.
export type StoredPrice = {
  // Major units, as the Decimal(12,2) columns hold it.
  amount: number | null;
  currencyCode: string | null;
  basis: string | null;
  // Canonical unit code the rate is per, when basis is PER_UNIT.
  perUnitCode: string | null;
};

export type PriceResolution =
  | { ok: true; price: ResolvedPrice }
  | { ok: false; reason: PriceProblem };

// Why a price could not be understood. Each is a different thing to tell a
// person, and none of them is "0".
export type PriceProblem =
  // No price was given at all. Entirely normal — price is optional
  // throughout FarmaTrade and always has been.
  | "no_price"
  // A price exists but predates explicit semantics: a bare number that
  // might be a total or might be a rate. NOT guessed at. See the migration
  // note in docs/measurement.md.
  | "ambiguous_legacy"
  // A currency FarmaTrade does not know, or none recorded.
  | "unknown_currency"
  // PER_UNIT with no basis unit, or a basis unit that cannot be resolved.
  | "unknown_price_unit"
  // The quantity is measured in something the price basis cannot apply to —
  // 20 USD/litre against 500 kg.
  | "incompatible_basis"
  // The quantity and the price basis are both known but need package
  // context to relate: 500 USD/tonne against 10 bags.
  | "context_required"
  // A rate is known but there is no quantity to apply it to.
  | "no_quantity";

// Reads a stored price into something with determined meaning, or says why
// it cannot.
//
// The legacy case is the important one. A row with an amount but no basis is
// a number from before this module existed, and there is no honest way to
// decide whether it was a total or a rate — the writers disagreed, the form
// said only "Price (optional)", and the value ranges that look like
// per-tonne prices come from development fixtures rather than from farmers.
// So it resolves to nothing, and every caller shows "price not stated in a
// form we can total" instead of a number that is wrong half the time.
export function resolvePrice(stored: StoredPrice, currencyOf: (code: string) => Currency | null): PriceResolution {
  if (stored.amount == null) return { ok: false, reason: "no_price" };
  if (!stored.basis) return { ok: false, reason: "ambiguous_legacy" };

  const currency = stored.currencyCode ? currencyOf(stored.currencyCode) : null;
  if (!currency) return { ok: false, reason: "unknown_currency" };

  const money = moneyFromMajor(stored.amount, currency);

  if (stored.basis === "TOTAL") {
    return { ok: true, price: { money, basis: "TOTAL", perUnit: null } };
  }
  if (stored.basis !== "PER_UNIT") return { ok: false, reason: "ambiguous_legacy" };

  const perUnit = unitByCode(stored.perUnitCode);
  if (!perUnit) return { ok: false, reason: "unknown_price_unit" };
  return { ok: true, price: { money, basis: "PER_UNIT", perUnit } };
}

// A quantity, as the thing a price gets applied to.
export type PricedQuantity = {
  value: number | null;
  unitCode: string | null;
};

export type Valuation =
  | {
      ok: true;
      total: Money;
      // How the total was arrived at, so a farmer can be shown the working
      // and a future invoice can cite it.
      derivation: "stated_total" | "rate_times_quantity";
      // Whether the arithmetic landed exactly on a minor unit, or had to be
      // rounded to one.
      exact: boolean;
    }
  | { ok: false; reason: PriceProblem };

// THE valuation primitive.
//
// Every question of the form "what is this worth" comes through here —
// opportunity cards, price signals, and whatever analytics or fee
// calculation comes later. Scattering the arithmetic is how the original
// contradiction happened: two callers, two readings, no shared definition.
//
// It returns structured meaning rather than a number, because "unknown" is
// a real and frequent answer and a caller that receives 0 will render 0.
export function valueOf(price: ResolvedPrice, quantity: PricedQuantity): Valuation {
  // A stated total is a stated total. Quantity does not scale it, cannot
  // scale it, and the quantity being unmeasurable does not make the total
  // unknown — "10 bags for 500 USD" is worth 500 USD whether or not anybody
  // can weigh a bag.
  if (price.basis === "TOTAL") {
    return { ok: true, total: price.money, derivation: "stated_total", exact: true };
  }

  if (quantity.value == null) return { ok: false, reason: "no_quantity" };
  const perUnit = price.perUnit;
  if (!perUnit) return { ok: false, reason: "unknown_price_unit" };

  const quantityUnit = unitByCode(quantity.unitCode);
  if (!quantityUnit) return { ok: false, reason: "unknown_price_unit" };

  // The quantity expressed in the unit the rate is per. 750 kg against a
  // per-tonne rate becomes 0.75; 10 bags against a per-bag rate becomes 10
  // with no conversion at all, which is the whole point of package pricing
  // needing no package mass.
  const inRateUnits = convertQuantity(quantity.value, quantityUnit, perUnit);
  if (!inRateUnits.ok) {
    return {
      ok: false,
      // Bags against a per-tonne rate is context_required: a package mass
      // would resolve it, and FarmaTrade does not have one. Litres against
      // a per-kilogram rate is incompatible: no context resolves it,
      // because mass is not volume.
      reason: inRateUnits.reason === "context_required" ? "context_required" : "incompatible_basis",
    };
  }

  const { value, exact } = multiplyMoney(price.money, inRateUnits.value);
  return { ok: true, total: value, derivation: "rate_times_quantity", exact };
}

// Convenience: resolve and value in one step, which is what nearly every
// caller wants.
export function valuationFor(
  stored: StoredPrice,
  quantity: PricedQuantity,
  currencyOf: (code: string) => Currency | null,
): Valuation {
  const resolved = resolvePrice(stored, currencyOf);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };
  return valueOf(resolved.price, quantity);
}

// ---------------------------------------------------------------------------
// Rate comparison
// ---------------------------------------------------------------------------

export type RateComparison =
  | { ok: true; rate: Money; perUnit: CanonicalUnit }
  | { ok: false; reason: PriceProblem };

// A rate restated per a different unit, so two quotes can be compared.
//
// 500 USD/tonne and 0.50 USD/kg are the same rate written two ways, and
// this is what proves it. 20 USD/bag and 500 USD/tonne are not comparable
// and this refuses to make them so — the conversion that would be needed is
// a package mass, which is a fact about a particular deal rather than about
// the word "bag".
//
// Currencies are never normalized against one another. A USD rate and a ZAR
// rate are two different questions, and answering them together would need
// an exchange rate FarmaTrade has no business inventing.
//
// Deliberately not wired into ranking. This phase establishes what a price
// means; deciding that cheaper should rank higher is a product judgement
// for a later one.
export function rateIn(price: ResolvedPrice, target: CanonicalUnit): RateComparison {
  if (price.basis !== "PER_UNIT" || !price.perUnit) {
    return { ok: false, reason: "incompatible_basis" };
  }

  // How many target units make one basis unit. 1 tonne is 1000 kg, so a
  // per-tonne rate divided by 1000 is the per-kg rate.
  const perBasis = convertQuantity(1, price.perUnit, target);
  if (!perBasis.ok) {
    return {
      ok: false,
      reason: perBasis.reason === "context_required" ? "context_required" : "incompatible_basis",
    };
  }

  const { value } = multiplyMoney(price.money, 1 / perBasis.value);
  return { ok: true, rate: value, perUnit: target };
}

// Whether two prices are the same commercial rate.
//
// False for anything that is not a like-for-like comparison, including two
// rates in different currencies — which is a refusal, not a judgement that
// they differ.
export function sameRate(a: ResolvedPrice, b: ResolvedPrice): boolean {
  if (a.basis !== "PER_UNIT" || b.basis !== "PER_UNIT") return false;
  if (a.money.currency.code !== b.money.currency.code) return false;
  if (!b.perUnit) return false;
  const restated = rateIn(a, b.perUnit);
  return restated.ok && restated.rate.minor === b.money.minor;
}

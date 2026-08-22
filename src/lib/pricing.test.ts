import { describe, expect, it } from "vitest";
import {
  rateIn,
  resolvePrice,
  sameRate,
  valuationFor,
  type ResolvedPrice,
  type StoredPrice,
} from "./pricing";
import {
  CURRENCIES,
  currencyByCode,
  formatMoneyAmount,
  moneyFromMajor,
  moneyToMajor,
  moneysEqual,
  multiplyMoney,
} from "./money";
import { UNITS } from "./measurement";

const USD = CURRENCIES.USD;
const ZAR = CURRENCIES.ZAR;

function stored(overrides: Partial<StoredPrice> = {}): StoredPrice {
  return {
    amount: 500,
    currencyCode: "USD",
    basis: "PER_UNIT",
    perUnitCode: "METRIC_TONNE",
    ...overrides,
  };
}

const value = (price: StoredPrice, quantity: number | null, unitCode: string | null) =>
  valuationFor(price, { value: quantity, unitCode }, currencyByCode);

// Totals are asserted in major units, which is how a person reads them.
const major = (v: Extract<ReturnType<typeof value>, { ok: true }>) => moneyToMajor(v.total);

describe("money", () => {
  // Y. Exactness.
  it("holds amounts as integer minor units", () => {
    expect(moneyFromMajor(500, USD).minor).toBe(50000);
    expect(moneyFromMajor(0.1, USD).minor).toBe(10);
  });

  it("does not accumulate binary floating point error", () => {
    // The classic: 0.1 + 0.2 is 0.30000000000000004 in IEEE arithmetic.
    // Integer minor units make it 10 + 20 = 30.
    const a = moneyFromMajor(0.1, USD);
    const b = moneyFromMajor(0.2, USD);
    expect(a.minor + b.minor).toBe(30);
    expect(moneyToMajor({ minor: a.minor + b.minor, currency: USD })).toBe(0.3);
  });

  it("rounds a fractional minor unit rather than carrying it", () => {
    // A third of a dollar is not an amount anybody can be paid.
    const { value, exact } = multiplyMoney(moneyFromMajor(1, USD), 1 / 3);
    expect(value.minor).toBe(33);
    expect(exact).toBe(false);
  });

  it("reports exactness when the arithmetic lands cleanly", () => {
    const { value, exact } = multiplyMoney(moneyFromMajor(500, USD), 0.75);
    expect(value.minor).toBe(37500);
    expect(exact).toBe(true);
  });

  // L. Currency separation.
  it("never treats one currency's amount as another's", () => {
    expect(moneysEqual(moneyFromMajor(100, USD), moneyFromMajor(100, ZAR))).toBe(false);
  });

  it("writes an amount the way a person reads it", () => {
    expect(formatMoneyAmount(moneyFromMajor(500, USD))).toBe("$500");
    expect(formatMoneyAmount(moneyFromMajor(375.5, USD))).toBe("$375.50");
    expect(formatMoneyAmount(moneyFromMajor(100, ZAR))).toBe("R100");
  });

  // K. Unknown currency.
  it("resolves no currency for a code it does not know", () => {
    expect(currencyByCode("XYZ")).toBeNull();
    expect(currencyByCode(null)).toBeNull();
  });
});

describe("resolvePrice", () => {
  it("reads an explicit total", () => {
    const resolved = resolvePrice(stored({ basis: "TOTAL", perUnitCode: null }), currencyByCode);
    expect(resolved.ok && resolved.price.basis).toBe("TOTAL");
  });

  it("reads an explicit rate with its basis unit", () => {
    const resolved = resolvePrice(stored(), currencyByCode);
    expect(resolved.ok && resolved.price.perUnit?.code).toBe("METRIC_TONNE");
  });

  it("treats an absent price as absent, not as zero", () => {
    expect(resolvePrice(stored({ amount: null }), currencyByCode)).toEqual({
      ok: false,
      reason: "no_price",
    });
  });

  // R. Legacy ambiguity.
  it("refuses to decide what a bare legacy number meant", () => {
    // A price with no basis predates explicit semantics. One reader treated
    // it as a total and another as a rate; the form said only "Price
    // (optional)". There is no honest answer and inventing one would be
    // wrong about half the rows.
    expect(resolvePrice(stored({ basis: null }), currencyByCode)).toEqual({
      ok: false,
      reason: "ambiguous_legacy",
    });
  });

  // K. Unknown currency is not silently USD.
  it("does not assume a missing currency is the pilot's", () => {
    // Zimbabwe's region record says USD, and it would be easy to default to
    // it. But cross-border trade is opt-in per intent, so a price with no
    // recorded currency genuinely might be ZAR.
    expect(resolvePrice(stored({ currencyCode: null }), currencyByCode)).toEqual({
      ok: false,
      reason: "unknown_currency",
    });
    expect(resolvePrice(stored({ currencyCode: "XYZ" }), currencyByCode)).toEqual({
      ok: false,
      reason: "unknown_currency",
    });
  });

  it("refuses a rate with no basis unit, which is the original ambiguity", () => {
    expect(resolvePrice(stored({ perUnitCode: null }), currencyByCode)).toEqual({
      ok: false,
      reason: "unknown_price_unit",
    });
  });
});

describe("valueOf", () => {
  // A. Explicit total.
  it("values a stated total as itself", () => {
    const result = value(stored({ amount: 500, basis: "TOTAL", perUnitCode: null }), 2, "METRIC_TONNE");
    expect(result.ok && major(result)).toBe(500);
    expect(result.ok && result.derivation).toBe("stated_total");
  });

  // B. Explicit unit rate.
  it("values 2 tonnes at 500 USD per tonne as 1000 USD", () => {
    const result = value(stored(), 2, "METRIC_TONNE");
    expect(result.ok && major(result)).toBe(1000);
    expect(result.ok && result.derivation).toBe("rate_times_quantity");
  });

  // C. Cross-unit rate.
  it("values 750 kg at 500 USD per tonne as 375 USD", () => {
    const result = value(stored(), 750, "KILOGRAM");
    expect(result.ok && major(result)).toBe(375);
  });

  // D. Reverse cross-unit rate.
  it("values 0.5 tonnes at 2 USD per kg as 1000 USD", () => {
    const result = value(
      stored({ amount: 2, perUnitCode: "KILOGRAM" }),
      0.5,
      "METRIC_TONNE",
    );
    expect(result.ok && major(result)).toBe(1000);
  });

  // E. Package price, no mass conversion needed.
  it("values 10 bags at 20 USD per bag as 200 USD", () => {
    // No bag mass is required or consulted. The price basis is the bag and
    // the quantity is in bags, so the units already agree.
    const result = value(stored({ amount: 20, perUnitCode: "BAG" }), 10, "BAG");
    expect(result.ok && major(result)).toBe(200);
  });

  // G/J. A per-package price stays per-package.
  it("does not rescale a per-bag price into a per-kilogram one", () => {
    // Even once package mass exists, the parties agreed a price per bag.
    // Ten bags is 200 USD, and no quantity equivalence changes that.
    const perBag = value(stored({ amount: 20, perUnitCode: "BAG" }), 10, "BAG");
    expect(perBag.ok && major(perBag)).toBe(200);
  });

  // H. Incompatible basis.
  it("produces no value for 500 kg at 20 USD per litre", () => {
    // Both are numbers and multiplying them would produce 10000 of
    // something. Mass is not volume and no context makes it so.
    expect(value(stored({ amount: 20, perUnitCode: "LITRE" }), 500, "KILOGRAM")).toEqual({
      ok: false,
      reason: "incompatible_basis",
    });
  });

  // F, in its deferred form. Contextual package equivalence is not on the
  // branch, so this must remain unresolved rather than guessed.
  it("produces no value for 10 bags at 500 USD per tonne", () => {
    // The distinction from the incompatible case matters: a package mass
    // WOULD resolve this, so it is context_required rather than a
    // permanent impossibility. Nothing on the branch supplies one yet.
    expect(value(stored(), 10, "BAG")).toEqual({ ok: false, reason: "context_required" });
  });

  // I. A total survives an unmeasurable quantity.
  it("values a stated total even when the quantity cannot be weighed", () => {
    // 10 bags of unknown mass for 500 USD is worth 500 USD. Pricing and
    // capacity are separate domains, and capacity being unable to count
    // bags says nothing about what was agreed to be paid.
    const result = value(stored({ amount: 500, basis: "TOTAL", perUnitCode: null }), 10, "BAG");
    expect(result.ok && major(result)).toBe(500);
  });

  it("values a stated total with no quantity at all", () => {
    const result = value(stored({ amount: 500, basis: "TOTAL", perUnitCode: null }), null, null);
    expect(result.ok && major(result)).toBe(500);
  });

  it("has no total for a rate with nothing to apply it to", () => {
    expect(value(stored(), null, null)).toEqual({ ok: false, reason: "no_quantity" });
  });

  // R, through the valuation path.
  it("produces no value at all from a legacy ambiguous price", () => {
    // Not price × quantity, and not price ÷ quantity. Nothing.
    expect(value(stored({ basis: null }), 10, "METRIC_TONNE")).toEqual({
      ok: false,
      reason: "ambiguous_legacy",
    });
  });

  // Y. Exactness through a realistic chain.
  it("keeps a repeating division honest instead of producing float noise", () => {
    const result = value(stored({ amount: 100 }), 1 / 3, "METRIC_TONNE");
    expect(result.ok && major(result)).toBe(33.33);
    expect(result.ok && result.exact).toBe(false);
  });

  it("reports an exact valuation as exact", () => {
    const result = value(stored(), 750, "KILOGRAM");
    expect(result.ok && result.exact).toBe(true);
  });
});

describe("rateIn", () => {
  const perTonne: ResolvedPrice = {
    money: moneyFromMajor(500, USD),
    basis: "PER_UNIT",
    perUnit: UNITS.METRIC_TONNE,
  };

  // V. Equivalent rates.
  it("restates 500 USD per tonne as 0.50 USD per kg", () => {
    const restated = rateIn(perTonne, UNITS.KILOGRAM);
    expect(restated.ok && moneyToMajor(restated.rate)).toBe(0.5);
  });

  it("proves the two spellings are the same rate", () => {
    const perKg: ResolvedPrice = {
      money: moneyFromMajor(0.5, USD),
      basis: "PER_UNIT",
      perUnit: UNITS.KILOGRAM,
    };
    expect(sameRate(perTonne, perKg)).toBe(true);
  });

  it("knows when two rates genuinely differ", () => {
    const cheaper: ResolvedPrice = {
      money: moneyFromMajor(0.45, USD),
      basis: "PER_UNIT",
      perUnit: UNITS.KILOGRAM,
    };
    expect(sameRate(perTonne, cheaper)).toBe(false);
  });

  // W. Incomparable without package context.
  it("will not restate a per-tonne rate per bag", () => {
    expect(rateIn(perTonne, UNITS.BAG)).toEqual({ ok: false, reason: "context_required" });
  });

  it("will not restate a per-bag rate per tonne", () => {
    const perBag: ResolvedPrice = {
      money: moneyFromMajor(20, USD),
      basis: "PER_UNIT",
      perUnit: UNITS.BAG,
    };
    expect(rateIn(perBag, UNITS.METRIC_TONNE)).toEqual({ ok: false, reason: "context_required" });
    expect(sameRate(perBag, perTonne)).toBe(false);
  });

  // X. Currency mismatch is never normalized away.
  it("never compares rates across currencies", () => {
    // 500 USD/tonne and 500 ZAR/tonne are wildly different offers, and
    // saying so needs an exchange rate FarmaTrade has no business inventing.
    const inRand: ResolvedPrice = {
      money: moneyFromMajor(500, ZAR),
      basis: "PER_UNIT",
      perUnit: UNITS.METRIC_TONNE,
    };
    expect(sameRate(perTonne, inRand)).toBe(false);
  });

  it("refuses to express a stated total as a rate", () => {
    const total: ResolvedPrice = {
      money: moneyFromMajor(500, USD),
      basis: "TOTAL",
      perUnit: null,
    };
    expect(rateIn(total, UNITS.KILOGRAM)).toEqual({ ok: false, reason: "incompatible_basis" });
    expect(sameRate(total, perTonne)).toBe(false);
  });

  it("will not cross dimensions", () => {
    expect(rateIn(perTonne, UNITS.LITRE)).toEqual({ ok: false, reason: "incompatible_basis" });
  });
});

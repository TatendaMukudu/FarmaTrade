// Money: an amount that knows what currency it is in.
//
// Currency was never stored anywhere. It was *derived at display time* from
// the viewing party's country — a Zimbabwean farmer's prices were formatted
// as USD because Zimbabwe's region record says USD, and a South African's
// as ZAR because theirs says ZAR (see regions.ts). That works exactly as
// long as both sides of a trade are in the same country, and FarmaTrade has
// supported opted-in cross-border trade since the beginning. A ZW seller and
// a ZA buyer agreeing on "450" have never had a way to record which 450 they
// meant.
//
// So money here is an amount plus an explicit currency, and 100 USD is not
// 100 ZAR however similar the numbers look. There is no conversion between
// them and there will not be one in this module: identifying money and
// moving money are different problems, and the second needs rates, a source
// for them, and a decision about who bears the spread.
//
// AMOUNTS ARE INTEGER MINOR UNITS. 500 USD is 50000, not 500.0. Binary
// floats cannot represent 0.1 exactly, and a system that does commercial
// arithmetic in them produces 19.999999999999996 eventually — which is
// tolerable for an estimated tonnage and not tolerable for what somebody is
// owed. P0.5 deliberately kept Float for physical quantities because those
// are estimates; money is not an estimate, and this is the opposite
// decision made for the opposite reason.
//
// Pure and DB-free.

// The currencies FarmaTrade actually operates in, taken from the regions it
// supports rather than from ISO 4217 wholesale. Seeding 180 currencies to
// use five would be inventing a market presence FarmaTrade does not have.
//
// In code rather than in a table, for the same reason units are: a currency
// whose minor-unit exponent an admin could edit is one that can silently
// change what a completed agreement was worth. The set extends by adding a
// row here, which is a reviewed change.
export type CurrencyCode = "USD" | "ZAR" | "KES" | "ZMW" | "MWK";

export type Currency = {
  code: CurrencyCode;
  // Decimal places. Every currency FarmaTrade touches happens to have two;
  // the field exists because that is a fact about each currency rather than
  // a constant, and a market with a zero-decimal currency should not need
  // this module rewritten.
  exponent: number;
  symbol: string;
};

export const CURRENCIES: Record<CurrencyCode, Currency> = {
  USD: { code: "USD", exponent: 2, symbol: "$" },
  ZAR: { code: "ZAR", exponent: 2, symbol: "R" },
  KES: { code: "KES", exponent: 2, symbol: "KSh" },
  ZMW: { code: "ZMW", exponent: 2, symbol: "K" },
  MWK: { code: "MWK", exponent: 2, symbol: "MK" },
};

export function currencyByCode(code: string | null | undefined): Currency | null {
  if (!code) return null;
  return CURRENCIES[code.toUpperCase() as CurrencyCode] ?? null;
}

// An amount of money. `minor` is always an integer.
export type Money = {
  minor: number;
  currency: Currency;
};

function minorFactor(currency: Currency): number {
  return 10 ** currency.exponent;
}

// Builds Money from a major-unit figure — what a person types, and what the
// Decimal(12,2) columns hold.
//
// Rounds to the currency's minor unit, because a fractional cent is not an
// amount anybody can be paid. Half away from zero, which is what people mean
// by rounding and what a farmer checking the arithmetic by hand will expect.
export function moneyFromMajor(major: number, currency: Currency): Money {
  const scaled = major * minorFactor(currency);
  return { minor: roundHalfAwayFromZero(scaled), currency };
}

export function moneyToMajor(money: Money): number {
  return money.minor / minorFactor(money.currency);
}

function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

// Multiplies money by a quantity — the one operation that turns a rate into
// a total.
//
// The quantity is a Float, because physical quantities are (see P0.5). The
// product is rounded straight back to an integer minor unit, so the float
// never survives past this call and cannot accumulate. `exact` says whether
// the rounding actually changed anything, so a caller that cares — an
// invoice, one day — can tell a clean 375.00 from a 333.33 that was really
// a third.
export function multiplyMoney(
  money: Money,
  quantity: number,
): { value: Money; exact: boolean } {
  const product = money.minor * quantity;
  const rounded = roundHalfAwayFromZero(product);
  return {
    value: { minor: rounded, currency: money.currency },
    exact: Math.abs(product - rounded) < 1e-9,
  };
}

export function sameCurrency(a: Money, b: Money): boolean {
  return a.currency.code === b.currency.code;
}

export function moneysEqual(a: Money, b: Money): boolean {
  return sameCurrency(a, b) && a.minor === b.minor;
}

// Written the way a person reads it. Display only — never parsed back, and
// never the input to arithmetic.
export function formatMoneyAmount(money: Money): string {
  const major = moneyToMajor(money);
  const decimals = money.currency.exponent;
  return `${money.currency.symbol}${major.toLocaleString(undefined, {
    minimumFractionDigits: major % 1 === 0 ? 0 : decimals,
    maximumFractionDigits: decimals,
  })}`;
}

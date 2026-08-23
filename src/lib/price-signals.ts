// What things are actually going for, near you.
//
// `Intent.askingPrice` has been collected since launch and read by exactly one
// thing: a single card's "Est. value" line. Nothing ever aggregated it. For
// a smallholder deciding whether to accept an offer, "maize is going for
// $280-320 a tonne in your district this week" is plausibly the most useful
// sentence a marketplace can produce, and the numbers were already there.
//
// Reported as a range, never a single figure. A median dressed up as "the
// price" invites a farmer to treat it as a valuation, and it is not one —
// it is what a handful of neighbours happened to ask for. The interquartile
// range is the honest shape of that: half the listings fell in here.
//
// Asking prices, not settled prices. FarmaTrade has no payment rail and
// therefore no idea what anything actually sold for, so every line this
// produces says "asking" and means it. Wiring in settlement data later is a
// new input to this module, not a new module.
//
// Pure and DB-free.

import { unitPerLabel } from "@/lib/units";
import { CURRENCIES, currencyByCode, moneyToMajor } from "@/lib/money";

// Below this many listings there is no range worth quoting — it would be
// one or two neighbours' opinions with a statistic painted on.
export const MIN_LISTINGS = 4;

// Past this, a listing is describing a different market than today's.
export const PRICE_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// One listing's asking RATE, already resolved into unambiguous terms by the
// caller.
//
// `unitPrice` used to be `askingPrice / quantity` computed here-ish, which
// silently assumed the stored number was a total. That assumption was one
// half of a contradiction — estimatedIntentValue assumed the opposite — and
// this module no longer does the division at all. The caller resolves the
// price through the one valuation primitive and hands over a rate that
// already knows what it is.
//
// A listing whose price meaning is unknown never reaches here. Excluded
// rather than guessed: a market signal built from numbers that might be
// totals and might be rates is worse than no signal, because it looks
// authoritative.
export type PricedListing = {
  // What is being priced. Crop type where a post is linked to real produce,
  // otherwise the category — a title string is not something to group on.
  subject: string;
  district: string;
  // The canonical unit the rate is per, and the word for it.
  unit: string;
  // ISO 4217. Part of the grouping key, because a range that blends USD and
  // ZAR asking prices is not a range of anything.
  currencyCode: string;
  // Minor units per one `unit`. Integers, so a median never lands on a
  // fraction of a cent.
  unitPrice: number;
  postedAt: Date;
};

export type PriceSignal = {
  subject: string;
  district: string;
  unit: string;
  currencyCode: string;
  listings: number;
  low: number;
  median: number;
  high: number;
  // The sentence to show. Always a range, always "asking".
  line: string;
};

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next !== undefined ? sorted[base] + rest * (next - sorted[base]) : sorted[base];
}

function round(value: number): number {
  // Whole units above ten — nobody quotes a tonne of maize to the cent — but
  // keep two decimals below that, where a crate might genuinely be $2.50.
  return value >= 10 ? Math.round(value) : Math.round(value * 100) / 100;
}

function money(value: number): string {
  return value >= 10 ? value.toLocaleString() : value.toFixed(2);
}

// Groups listings by what they are, where they are, and what they're
// measured in — all three, because a tonne and a crate of the same crop in
// the same district are not comparable numbers.
export function summarizePrices(listings: PricedListing[], now: Date): PriceSignal[] {
  const fresh = listings.filter(
    (l) => (now.getTime() - l.postedAt.getTime()) / DAY_MS <= PRICE_WINDOW_DAYS,
  );

  const groups = new Map<string, PricedListing[]>();
  for (const listing of fresh) {
    if (!(listing.unitPrice > 0)) continue;
    const key = `${listing.subject}|${listing.district}|${listing.unit}|${listing.currencyCode}`;
    const group = groups.get(key) ?? [];
    group.push(listing);
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((group) => group.length >= MIN_LISTINGS)
    .map((group) => {
      // Quantiles over integer minor units, so the median of an even-sized
      // group cannot land on a fraction of a cent that then gets rendered
      // as a plausible-looking price nobody quoted.
      const prices = group.map((l) => l.unitPrice).sort((a, b) => a - b);
      const { subject, district, unit, currencyCode } = group[0];
      const currency = currencyByCode(currencyCode) ?? CURRENCIES.USD;
      const toMajor = (minor: number) =>
        round(moneyToMajor({ minor: Math.round(minor), currency }));
      const low = toMajor(quantile(prices, 0.25));
      const median = toMajor(quantile(prices, 0.5));
      const high = toMajor(quantile(prices, 0.75));
      // The symbol comes from the group's own currency, not from the
      // viewer's country. A ZAR listing is a ZAR listing whoever is reading.
      const currencySymbol = currency.symbol;
      return {
        subject,
        district,
        unit,
        currencyCode,
        listings: group.length,
        low,
        median,
        high,
        line:
          low === high
            ? `${subject} in ${district}: asking ${currencySymbol}${money(median)} per ${unitPerLabel(unit)} across ${group.length} listings.`
            : `${subject} in ${district}: asking ${currencySymbol}${money(low)}–${currencySymbol}${money(high)} per ${unitPerLabel(unit)} across ${group.length} listings.`,
      };
    })
    .sort((a, b) => b.listings - a.listings || a.subject.localeCompare(b.subject));
}

// The one price line most worth a farmer's attention: whatever they
// themselves have most of on the market right now. Null when their own
// district has too little history to say anything.
export function signalForSubject(
  signals: PriceSignal[],
  subject: string,
  district: string,
): PriceSignal | null {
  return (
    signals.find((s) => s.subject === subject && s.district === district) ?? null
  );
}

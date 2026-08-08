import { describe, expect, it } from "vitest";
import {
  MIN_LISTINGS,
  PRICE_WINDOW_DAYS,
  signalForSubject,
  summarizePrices,
  type PricedListing,
} from "./price-signals";

const NOW = new Date("2026-08-08T09:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY);
}

function listing(overrides: Partial<PricedListing> = {}): PricedListing {
  return {
    subject: "Maize",
    district: "Marondera",
    unit: "TONNE",
    unitPrice: 300,
    postedAt: daysAgo(1),
    ...overrides,
  };
}

function priced(prices: number[], overrides: Partial<PricedListing> = {}): PricedListing[] {
  return prices.map((unitPrice) => listing({ unitPrice, ...overrides }));
}

describe("summarizePrices", () => {
  it("says nothing on a sample too thin to be a market", () => {
    expect(summarizePrices(priced([300, 310, 320]), NOW)).toEqual([]);
    expect(summarizePrices(priced([300, 310, 320, 330]), NOW)).toHaveLength(1);
    expect(MIN_LISTINGS).toBe(4);
  });

  it("reports a range rather than a single figure", () => {
    const [signal] = summarizePrices(priced([260, 280, 300, 320, 340]), NOW);
    expect(signal.low).toBeLessThan(signal.median);
    expect(signal.high).toBeGreaterThan(signal.median);
    expect(signal.line).toContain("–");
  });

  it("always says asking, because nothing here is a settled price", () => {
    const [signal] = summarizePrices(priced([260, 280, 300, 320]), NOW);
    expect(signal.line).toContain("asking");
  });

  it("is barely moved by one wild listing, where an average would be wrecked", () => {
    const prices = [280, 290, 300, 310, 320, 90000];
    const withOutlier = summarizePrices(priced(prices), NOW)[0];
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;

    // The mean lands above 15,000. The quoted range stays inside what the
    // real listings actually asked.
    expect(mean).toBeGreaterThan(15000);
    expect(withOutlier.median).toBeLessThan(330);
    expect(withOutlier.low).toBeGreaterThanOrEqual(280);
    expect(withOutlier.line).not.toContain("90,000");
  });

  it("ignores listings older than the window", () => {
    const stale = priced([300, 300, 300, 300], { postedAt: daysAgo(PRICE_WINDOW_DAYS + 5) });
    expect(summarizePrices(stale, NOW)).toEqual([]);
  });

  it("never divides a tonne against a crate", () => {
    const mixed = [
      ...priced([300, 310, 320, 330]),
      ...priced([4, 5, 6, 7], { unit: "CRATE" }),
    ];
    const signals = summarizePrices(mixed, NOW);
    expect(signals).toHaveLength(2);
    expect(signals.map((s) => s.unit).sort()).toEqual(["CRATE", "TONNE"]);
  });

  it("keeps districts and crops apart", () => {
    const mixed = [
      ...priced([300, 310, 320, 330]),
      ...priced([200, 210, 220, 230], { district: "Mutare" }),
      ...priced([90, 95, 100, 105], { subject: "Soya" }),
    ];
    expect(summarizePrices(mixed, NOW)).toHaveLength(3);
  });

  it("drops a listing whose price works out at zero or less", () => {
    expect(summarizePrices(priced([0, -5, 300, 310]), NOW)).toEqual([]);
  });

  it("rounds to whole units above ten, and to cents below", () => {
    const tonnes = summarizePrices(priced([300.4, 310.6, 320.2, 330.9]), NOW)[0];
    expect(tonnes.line).not.toMatch(/\.\d/);
    const crates = summarizePrices(priced([2.25, 2.5, 2.75, 3], { unit: "CRATE" }), NOW)[0];
    expect(crates.line).toMatch(/\d\.\d\d/);
  });

  it("uses the farmer's own currency symbol", () => {
    const [signal] = summarizePrices(priced([300, 310, 320, 330]), NOW, "KSh");
    expect(signal.line).toContain("KSh");
  });

  it("collapses to a single figure only when the range genuinely is one", () => {
    const [signal] = summarizePrices(priced([300, 300, 300, 300]), NOW);
    expect(signal.line).not.toContain("–");
    expect(signal.line).toContain("$300");
  });

  it("leads with the best-evidenced market", () => {
    const mixed = [
      ...priced([300, 310, 320, 330]),
      ...priced([90, 95, 100, 105, 110, 115], { subject: "Soya" }),
    ];
    expect(summarizePrices(mixed, NOW)[0].subject).toBe("Soya");
  });

  it("says how many listings are behind the number", () => {
    const [signal] = summarizePrices(priced([300, 310, 320, 330, 340]), NOW);
    expect(signal.listings).toBe(5);
    expect(signal.line).toContain("across 5 listings");
  });
});

describe("signalForSubject", () => {
  it("finds this farmer's own crop in their own district", () => {
    const signals = summarizePrices(
      [...priced([300, 310, 320, 330]), ...priced([200, 210, 220, 230], { district: "Mutare" })],
      NOW,
    );
    expect(signalForSubject(signals, "Maize", "Marondera")!.median).toBeGreaterThan(300);
    expect(signalForSubject(signals, "Maize", "Gweru")).toBeNull();
  });
});

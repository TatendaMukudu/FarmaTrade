import { describe, expect, it } from "vitest";
import {
  FALLBACK_REGION,
  PILOT_COUNTRY,
  REGIONS,
  formatMoney,
  isSupportedCountry,
  regionFor,
  supportedRegions,
} from "./regions";

describe("regionFor", () => {
  it("gives a farmer their own country's vocabulary, not Zimbabwe's", () => {
    expect(regionFor("ZW").labels).toEqual({ level1: "Province", level2: "District" });
    expect(regionFor("KE").labels).toEqual({ level1: "County", level2: "Sub-county" });
    expect(regionFor("ZA").labels.level2).toBe("Municipality");
    expect(regionFor("MW").labels.level1).toBe("Region");
  });

  it("is case-insensitive, since a country code can arrive from anywhere", () => {
    expect(regionFor("ke").code).toBe("KE");
  });

  it("falls back to neutral vocabulary for a country we have no pack for", () => {
    const region = regionFor("BR");
    expect(region.labels).toEqual(FALLBACK_REGION.labels);
    expect(region.labels.level1).not.toBe("Province");
    expect(region.code).toBe("BR");
  });

  it("gives an unlisted country an empty option list, so the form falls back to free text", () => {
    expect(regionFor("BR").level1).toEqual([]);
  });

  it("defaults to the pilot when nothing is stored, so existing parties are unaffected", () => {
    expect(regionFor(null).code).toBe(PILOT_COUNTRY);
    expect(regionFor(undefined).code).toBe(PILOT_COUNTRY);
    expect(regionFor("").code).toBe(PILOT_COUNTRY);
  });
});

describe("region packs", () => {
  it("keys every pack by its own country code", () => {
    for (const [key, region] of Object.entries(REGIONS)) {
      expect(region.code).toBe(key);
    }
  });

  it("gives every pack a timezone, a currency, and both labels", () => {
    for (const region of Object.values(REGIONS)) {
      expect(region.timeZone).toMatch(/^[A-Za-z]+\/[A-Za-z_]+$/);
      expect(region.currencyCode).toHaveLength(3);
      expect(region.currencySymbol.length).toBeGreaterThan(0);
      expect(region.labels.level1.length).toBeGreaterThan(0);
      expect(region.labels.level2.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate or empty division names in any pack", () => {
    for (const region of Object.values(REGIONS)) {
      expect(new Set(region.level1).size).toBe(region.level1.length);
      expect(region.level1.every((name) => name.trim().length > 0)).toBe(true);
    }
  });

  it("includes the pilot, without giving it special billing in the list", () => {
    expect(isSupportedCountry(PILOT_COUNTRY)).toBe(true);
    const names = supportedRegions().map((r) => r.country);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names[0]).not.toBe("Zimbabwe");
  });

  it("rejects a country it has no pack for", () => {
    expect(isSupportedCountry("BR")).toBe(false);
  });
});

describe("formatMoney", () => {
  it("prices in the farmer's own currency", () => {
    expect(formatMoney(1200, regionFor("ZW"))).toContain("1,200");
    expect(formatMoney(1200, regionFor("KE"))).toMatch(/KES|KSh/);
    expect(formatMoney(1200, regionFor("ZA"))).toMatch(/ZAR|R/);
  });

  it("rounds to whole units — nobody quotes maize to the cent", () => {
    expect(formatMoney(1200.49, regionFor("ZW"))).not.toContain(".");
  });
});

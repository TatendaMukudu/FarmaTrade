import { describe, expect, it } from "vitest";
import { distanceKm, boundingBox, distanceBand, distanceLabelFor } from "./geo-core";
import { regionPoint, countrySpec, enabledCountries, COUNTRIES } from "./countries";

// Real places, so the numbers are checkable against a map rather than
// against whatever the implementation happens to produce.
const MUTARE = { latitude: -18.97, longitude: 32.67 };
const BULAWAYO = { latitude: -20.15, longitude: 28.58 };
const HARARE = { latitude: -17.83, longitude: 31.05 };
const BEIRA = { latitude: -19.83, longitude: 34.85 };

describe("distanceKm", () => {
  it("is zero for a point against itself", () => {
    expect(distanceKm(MUTARE, MUTARE)).toBe(0);
  });

  it("is symmetric", () => {
    expect(distanceKm(MUTARE, HARARE)).toBeCloseTo(distanceKm(HARARE, MUTARE), 6);
  });

  it("matches known distances across Zimbabwe", () => {
    // Straight-line, not road distance — Harare–Mutare is ~212km as the
    // crow flies against ~263km by the A3. Radius matching is about
    // catchment, so the crow's number is the right one here, but it's worth
    // being explicit that they differ by a third.
    expect(distanceKm(HARARE, MUTARE)).toBeGreaterThan(195);
    expect(distanceKm(HARARE, MUTARE)).toBeLessThan(230);
    // Harare–Bulawayo is ~365km straight line, ~440km by road.
    expect(distanceKm(HARARE, BULAWAYO)).toBeGreaterThan(340);
    expect(distanceKm(HARARE, BULAWAYO)).toBeLessThan(390);
  });

  it("shows why administrative-name matching was wrong", () => {
    // This is the whole argument in one assertion. Beira is in another
    // country; Bulawayo is in the same one. The old `region = region` rule
    // could match the far one and could never match the near one.
    const toBeira = distanceKm(MUTARE, BEIRA);
    const toBulawayo = distanceKm(MUTARE, BULAWAYO);
    expect(toBeira).toBeLessThan(toBulawayo);
    expect(toBeira).toBeLessThan(300);
  });

  it("handles the equator and the antimeridian without blowing up", () => {
    const a = { latitude: 0, longitude: 179.9 };
    const b = { latitude: 0, longitude: -179.9 };
    // ~22km apart across the date line, not most of the way round the world.
    expect(distanceKm(a, b)).toBeLessThan(30);
  });
});

describe("boundingBox", () => {
  it("contains the centre", () => {
    const box = boundingBox(HARARE, 100);
    expect(HARARE.latitude).toBeGreaterThanOrEqual(box.minLatitude);
    expect(HARARE.latitude).toBeLessThanOrEqual(box.maxLatitude);
    expect(HARARE.longitude).toBeGreaterThanOrEqual(box.minLongitude);
    expect(HARARE.longitude).toBeLessThanOrEqual(box.maxLongitude);
  });

  it("is a superset of the circle — never excludes a point inside the radius", () => {
    // The box is the cheap indexed pre-filter; if it under-selected, real
    // matches would silently vanish before the exact check ever ran.
    const radius = 200;
    const box = boundingBox(HARARE, radius);
    for (const candidate of [MUTARE, BULAWAYO, BEIRA]) {
      if (distanceKm(HARARE, candidate) <= radius) {
        expect(candidate.latitude).toBeGreaterThanOrEqual(box.minLatitude);
        expect(candidate.latitude).toBeLessThanOrEqual(box.maxLatitude);
        expect(candidate.longitude).toBeGreaterThanOrEqual(box.minLongitude);
        expect(candidate.longitude).toBeLessThanOrEqual(box.maxLongitude);
      }
    }
  });

  it("widens in longitude at high latitude, where degrees are narrower", () => {
    const tropical = boundingBox({ latitude: 0, longitude: 0 }, 100);
    const arctic = boundingBox({ latitude: 70, longitude: 0 }, 100);
    const width = (b: ReturnType<typeof boundingBox>) => b.maxLongitude - b.minLongitude;
    expect(width(arctic)).toBeGreaterThan(width(tropical));
  });

  it("does not ask for an infinite box at the pole", () => {
    const box = boundingBox({ latitude: 90, longitude: 0 }, 100);
    expect(Number.isFinite(box.minLongitude)).toBe(true);
    expect(Number.isFinite(box.maxLongitude)).toBe(true);
  });
});

describe("distanceBand and labels", () => {
  it("bands by how far a truck actually has to go", () => {
    expect(distanceBand(3)).toBe("same_area");
    expect(distanceBand(60)).toBe("nearby");
    expect(distanceBand(250)).toBe("regional");
    expect(distanceBand(900)).toBe("far");
  });

  it("says something useful rather than a false-precision decimal", () => {
    expect(distanceLabelFor(3, { sameCountry: true })).toBe("Right nearby");
    expect(distanceLabelFor(62, { sameCountry: true })).toMatch(/60km away/);
  });

  it("flags a border crossing, because it's a real cost", () => {
    expect(distanceLabelFor(290, { sameCountry: false })).toMatch(/across the border/);
    expect(distanceLabelFor(290, { sameCountry: true })).not.toMatch(/border/);
  });
});

describe("country registry", () => {
  it("gives every country a unique ISO code", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("places every region with plausible coordinates", () => {
    for (const country of COUNTRIES) {
      expect(country.regions.length).toBeGreaterThan(0);
      for (const region of country.regions) {
        expect(region.latitude).toBeGreaterThanOrEqual(-90);
        expect(region.latitude).toBeLessThanOrEqual(90);
        expect(region.longitude).toBeGreaterThanOrEqual(-180);
        expect(region.longitude).toBeLessThanOrEqual(180);
      }
    }
  });

  it("lets each country name its own administrative levels", () => {
    // The point of the abstraction: "Province" is not a universal word.
    expect(countrySpec("ZW")!.region1Label).toBe("Province");
    expect(countrySpec("US")!.region1Label).toBe("State");
    expect(countrySpec("US")!.region2Label).toBe("County");
  });

  it("carries per-market currency and measurement differences", () => {
    expect(countrySpec("ZW")!.currencies).toContain("ZiG");
    expect(countrySpec("MZ")!.defaultCurrency).toBe("MZN");
    expect(countrySpec("US")!.measurement).toBe("IMPERIAL");
    expect(countrySpec("ZW")!.measurement).toBe("METRIC");
  });

  it("resolves a region to coordinates, case-insensitively", () => {
    expect(regionPoint("ZW", "Manicaland")).toEqual({ latitude: -18.97, longitude: 32.67 });
    expect(regionPoint("ZW", "  manicaland ")).not.toBeNull();
  });

  it("returns nothing for an unknown region rather than guessing", () => {
    expect(regionPoint("ZW", "Atlantis")).toBeNull();
    expect(regionPoint("XX", "Harare")).toBeNull();
  });

  it("separates 'open for signup' from 'reachable by trade'", () => {
    const enabled = enabledCountries().map((c) => c.code);
    expect(enabled).toContain("ZW");
    expect(enabled).toContain("ZA");
    expect(enabled).toContain("MZ");
    // The US is modelled but closed — a country can exist so cross-border
    // matching can reach it before the market is launched.
    expect(enabled).not.toContain("US");
    expect(countrySpec("US")).toBeDefined();
  });
});

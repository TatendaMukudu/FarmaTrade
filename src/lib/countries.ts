import type { Point } from "@/lib/geo-core";

// The markets FarmaTrade operates in, and everything that differs between
// them. Adding a country is adding an entry here — not a fork, not a
// deployment, and not a change to any matching, trust or signal logic,
// because none of those reference a country.
//
// The pilot is Zimbabwe. South Africa and Mozambique are here from the
// start because border trade with both is real and constant: Beira is the
// nearest deep-water port to eastern Zimbabwe, and Musina/Beitbridge is one
// of the busiest land crossings in Africa. A Mutare farmer's most valuable
// counterparty is often not Zimbabwean, and the old region-equality rule
// made that trade unreachable rather than merely unsupported.
//
// The US entry is deliberately included and deliberately not enabled: it's
// the proof that nothing in the model assumes metric units, a "region",
// or an African timezone. If adding it had required touching anything
// outside this file, the abstraction would have been wrong.

export type MeasurementSystem = "METRIC" | "IMPERIAL";

export type Region = {
  name: string;
  // Approximate centroid. Region-level accuracy (tens of km) is enough for
  // radius matching and honest about what we actually know — a farmer picks
  // a region from a list, they don't drop a pin. A party can override with
  // exact coordinates later without any of this changing.
  latitude: number;
  longitude: number;
};

export type CountrySpec = {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  // What this country calls its administrative levels. "Province" is a
  // Zimbabwean and South African word; the US has states and counties, the
  // UK has counties. The database columns are the neutral `region` and
  // `locality`; these are what a user is actually shown.
  region1Label: string;
  region2Label: string;
  defaultCurrency: string;
  // Currencies worth offering here, most likely first. Cross-border markets
  // genuinely trade in more than one, which is why this is a list.
  currencies: string[];
  measurement: MeasurementSystem;
  timeZone: string;
  languages: string[];
  phonePrefix: string;
  // Whether the market is open for signup. A country can exist in the model
  // — so cross-border matching can reach into it — before it's launched.
  enabled: boolean;
  regions: Region[];
};

export const COUNTRIES: CountrySpec[] = [
  {
    code: "ZW",
    name: "Zimbabwe",
    region1Label: "Province",
    region2Label: "District",
    defaultCurrency: "USD",
    // USD dominates larger and cross-border deals; ZiG is the local
    // currency (it replaced ZWL in 2024); ZAR circulates widely in the
    // south through border trade.
    currencies: ["USD", "ZiG", "ZAR"],
    measurement: "METRIC",
    timeZone: "Africa/Harare",
    languages: ["English", "Shona", "Ndebele", "Chewa", "Tonga"],
    phonePrefix: "+263",
    enabled: true,
    regions: [
      { name: "Harare", latitude: -17.83, longitude: 31.05 },
      { name: "Bulawayo", latitude: -20.15, longitude: 28.58 },
      { name: "Manicaland", latitude: -18.97, longitude: 32.67 },
      { name: "Mashonaland Central", latitude: -16.78, longitude: 31.08 },
      { name: "Mashonaland East", latitude: -18.19, longitude: 31.55 },
      { name: "Mashonaland West", latitude: -17.36, longitude: 30.2 },
      { name: "Masvingo", latitude: -20.07, longitude: 30.83 },
      { name: "Matabeleland North", latitude: -18.53, longitude: 27.5 },
      { name: "Matabeleland South", latitude: -21.05, longitude: 29.05 },
      { name: "Midlands", latitude: -19.45, longitude: 29.82 },
    ],
  },
  {
    code: "ZA",
    name: "South Africa",
    region1Label: "Province",
    region2Label: "Municipality",
    defaultCurrency: "ZAR",
    currencies: ["ZAR", "USD"],
    measurement: "METRIC",
    timeZone: "Africa/Johannesburg",
    languages: ["English", "Afrikaans", "Zulu", "Xhosa", "Sotho", "Tswana", "Venda"],
    phonePrefix: "+27",
    enabled: true,
    regions: [
      { name: "Limpopo", latitude: -23.4, longitude: 29.47 },
      { name: "Mpumalanga", latitude: -25.57, longitude: 30.53 },
      { name: "Gauteng", latitude: -26.27, longitude: 28.11 },
      { name: "North West", latitude: -26.66, longitude: 25.28 },
      { name: "Free State", latitude: -28.46, longitude: 26.79 },
      { name: "KwaZulu-Natal", latitude: -29.0, longitude: 31.0 },
      { name: "Eastern Cape", latitude: -32.3, longitude: 26.42 },
      { name: "Western Cape", latitude: -33.23, longitude: 21.86 },
      { name: "Northern Cape", latitude: -29.05, longitude: 21.86 },
    ],
  },
  {
    code: "MZ",
    name: "Mozambique",
    region1Label: "Province",
    region2Label: "District",
    defaultCurrency: "MZN",
    currencies: ["MZN", "USD", "ZAR"],
    measurement: "METRIC",
    timeZone: "Africa/Maputo",
    languages: ["Portuguese", "English", "Sena", "Ndau", "Shona"],
    phonePrefix: "+258",
    enabled: true,
    regions: [
      { name: "Maputo", latitude: -25.97, longitude: 32.58 },
      { name: "Gaza", latitude: -23.02, longitude: 32.72 },
      { name: "Inhambane", latitude: -23.87, longitude: 35.38 },
      { name: "Sofala", latitude: -19.83, longitude: 34.85 },
      { name: "Manica", latitude: -19.12, longitude: 33.48 },
      { name: "Tete", latitude: -16.16, longitude: 33.59 },
      { name: "Zambézia", latitude: -16.55, longitude: 36.9 },
      { name: "Nampula", latitude: -15.12, longitude: 39.27 },
      { name: "Cabo Delgado", latitude: -12.97, longitude: 40.52 },
      { name: "Niassa", latitude: -13.3, longitude: 35.25 },
    ],
  },
  {
    code: "US",
    name: "United States",
    region1Label: "State",
    region2Label: "County",
    defaultCurrency: "USD",
    currencies: ["USD"],
    // The reason this entry exists: it's the only non-metric market here,
    // and adding it required no change to matching, trust or signals.
    measurement: "IMPERIAL",
    timeZone: "America/Chicago",
    languages: ["English", "Spanish"],
    phonePrefix: "+1",
    enabled: false,
    regions: [
      { name: "California", latitude: 36.78, longitude: -119.42 },
      { name: "Iowa", latitude: 42.01, longitude: -93.21 },
      { name: "Texas", latitude: 31.97, longitude: -99.9 },
      { name: "Nebraska", latitude: 41.49, longitude: -99.9 },
      { name: "Kansas", latitude: 38.5, longitude: -98.38 },
    ],
  },
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function countrySpec(code: string): CountrySpec | undefined {
  return BY_CODE.get(code);
}

// Markets open for signup. Cross-border matching can still reach a
// disabled country's parties — being closed to new registrations is not the
// same as being invisible to trade.
export function enabledCountries(): CountrySpec[] {
  return COUNTRIES.filter((c) => c.enabled);
}

export function regionsFor(code: string): Region[] {
  return countrySpec(code)?.regions ?? [];
}

// Coordinates for a region within a country. Null when the region isn't one
// we know — a party who typed something unrecognised gets no coordinates
// rather than a wrong guess, and simply doesn't participate in radius
// matching until they're placed.
export function regionPoint(countryCode: string, regionName: string): Point | null {
  const region = regionsFor(countryCode).find(
    (r) => r.name.toLowerCase() === regionName.trim().toLowerCase(),
  );
  return region ? { latitude: region.latitude, longitude: region.longitude } : null;
}

export const DEFAULT_COUNTRY = "ZW";

// Currency options for a party, their own market's first. Kept as a
// function rather than a constant because the answer now depends on who's
// asking — a Mozambican seller shouldn't be offered ZiG ahead of MZN.
export function currenciesFor(countryCode: string): string[] {
  return countrySpec(countryCode)?.currencies ?? ["USD"];
}

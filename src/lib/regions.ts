// Where a farmer is, and what that means for how FarmaTrade talks to them.
//
// FarmaTrade is for farmers. It is piloting in Zimbabwe, which is not the
// same thing as being a Zimbabwean product, and the difference had leaked
// into the code: a hardcoded province list, a hardcoded Harare timezone, a
// hardcoded dollar sign, and validation messages that told a Kenyan farmer
// their "Province is required" when the word they use is County.
//
// A region pack is the answer: everything that varies by country in one
// place, so Zimbabwe is the pilot rather than the universe. Adding a country
// is a new entry here, not a change anywhere else.
//
// What is deliberately NOT here: anything about *who may trade with whom*.
// Country shapes vocabulary and formatting, never permission — see
// `crossBorder` in matching.ts for how a farmer opts into international
// trade. A pack is a translation layer, not a border.
//
// Pure and DB-free, so a region's shape is unit-testable.

// The two administrative levels almost every country has under the national
// one, whatever it calls them. FarmaTrade stores these as `province` and
// `district` (the schema's original Zimbabwean naming, kept because renaming
// the columns would be a large mechanical diff for no behaviour change) and
// *displays* them using whatever the farmer's own country calls them.
export type RegionLabels = {
  level1: string;
  level2: string;
};

export type Region = {
  // ISO 3166-1 alpha-2.
  code: string;
  country: string;
  // IANA zone, used for the time-of-day greeting so "good morning" means
  // morning where the farmer is, not where the server is.
  timeZone: string;
  currencyCode: string;
  currencySymbol: string;
  labels: RegionLabels;
  // The level-1 divisions, when a fixed list helps. Empty is a legitimate
  // value: a country whose list we haven't entered gets a free-text field
  // rather than being unusable, so onboarding a new market never waits on a
  // code change.
  level1: readonly string[];
};

const ZIMBABWE_PROVINCES = [
  "Harare",
  "Bulawayo",
  "Manicaland",
  "Mashonaland Central",
  "Mashonaland East",
  "Mashonaland West",
  "Masvingo",
  "Matabeleland North",
  "Matabeleland South",
  "Midlands",
] as const;

const SOUTH_AFRICA_PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "Northern Cape",
  "North West",
  "Western Cape",
] as const;

const KENYA_COUNTIES = [
  "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa",
  "Homa Bay", "Isiolo", "Kajiado", "Kakamega", "Kericho", "Kiambu", "Kilifi",
  "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu",
  "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori", "Mombasa",
  "Murang'a", "Nairobi", "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua",
  "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River", "Tharaka-Nithi",
  "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot",
] as const;

const ZAMBIA_PROVINCES = [
  "Central", "Copperbelt", "Eastern", "Luapula", "Lusaka", "Muchinga",
  "Northern", "North-Western", "Southern", "Western",
] as const;

const MALAWI_DISTRICTS = [
  "Central", "Northern", "Southern",
] as const;

export const REGIONS: Record<string, Region> = {
  ZW: {
    code: "ZW",
    country: "Zimbabwe",
    timeZone: "Africa/Harare",
    // Zimbabwe prices in US dollars in practice, whatever the official
    // position — the farmers this is for quote in USD.
    currencyCode: "USD",
    currencySymbol: "$",
    labels: { level1: "Province", level2: "District" },
    level1: ZIMBABWE_PROVINCES,
  },
  ZA: {
    code: "ZA",
    country: "South Africa",
    timeZone: "Africa/Johannesburg",
    currencyCode: "ZAR",
    currencySymbol: "R",
    labels: { level1: "Province", level2: "Municipality" },
    level1: SOUTH_AFRICA_PROVINCES,
  },
  KE: {
    code: "KE",
    country: "Kenya",
    timeZone: "Africa/Nairobi",
    currencyCode: "KES",
    currencySymbol: "KSh",
    labels: { level1: "County", level2: "Sub-county" },
    level1: KENYA_COUNTIES,
  },
  ZM: {
    code: "ZM",
    country: "Zambia",
    timeZone: "Africa/Lusaka",
    currencyCode: "ZMW",
    currencySymbol: "K",
    labels: { level1: "Province", level2: "District" },
    level1: ZAMBIA_PROVINCES,
  },
  MW: {
    code: "MW",
    country: "Malawi",
    timeZone: "Africa/Blantyre",
    currencyCode: "MWK",
    currencySymbol: "MK",
    labels: { level1: "Region", level2: "District" },
    level1: MALAWI_DISTRICTS,
  },
};

// Where the pilot is running. This is the signup form's default and nothing
// more — it is not a restriction, and every read of it has a fallback for a
// party in any other country.
export const PILOT_COUNTRY = "ZW";

// The fallback for a country we have no pack for. Neutral vocabulary rather
// than Zimbabwe's, so an unlisted country reads as generic rather than as
// somebody else's home.
export const FALLBACK_REGION: Region = {
  code: "",
  country: "",
  timeZone: "UTC",
  currencyCode: "USD",
  currencySymbol: "$",
  labels: { level1: "Region", level2: "District" },
  level1: [],
};

export function regionFor(countryCode: string | null | undefined): Region {
  if (!countryCode) return REGIONS[PILOT_COUNTRY];
  return REGIONS[countryCode.toUpperCase()] ?? { ...FALLBACK_REGION, code: countryCode.toUpperCase() };
}

export function isSupportedCountry(countryCode: string): boolean {
  return countryCode.toUpperCase() in REGIONS;
}

// Sorted by country name so the signup dropdown doesn't imply a ranking of
// markets, with no special position for the pilot.
export function supportedRegions(): Region[] {
  return Object.values(REGIONS).sort((a, b) => a.country.localeCompare(b.country));
}

// Money in the farmer's own currency. Falls back to a plain symbol-and-digits
// format when a runtime has no data for the locale, which is the common case
// on the low-end Android browsers this has to work on.
export function formatMoney(amount: number, region: Region): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: region.currencyCode,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${region.currencySymbol}${Math.round(amount).toLocaleString()}`;
  }
}

// "Province"/"District" in Zimbabwe, "County"/"Sub-county" in Kenya. Used by
// form labels, validation messages, and anywhere prose names a place level,
// so a farmer is never asked for an administrative unit their country
// doesn't have.
export function level1Label(region: Region): string {
  return region.labels.level1;
}

export function level2Label(region: Region): string {
  return region.labels.level2;
}

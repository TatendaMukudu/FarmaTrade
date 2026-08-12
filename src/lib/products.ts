// What a thing actually is, independent of what anyone calls it.
//
// Matching had no concept of a commodity. Two posts paired because both were
// `PRODUCE` — so a maize seller and a tomato buyer in the same district
// matched, and nothing in the system could tell they shouldn't. `cropType`
// was recorded on ProduceStock and never read by the matcher at all.
//
// This is the missing layer. A canonical Product is the thing itself; an
// alias is any of the names people use for it. The farmer owns the language,
// FarmaTrade owns the ontology underneath:
//
//   canonical  pearl_millet
//   Shona      mhunga
//   buyer      pearl millet
//   English    bulrush millet
//
// All four resolve to one product, so a Harare buyer's "pearl millet"
// requirement finds a Mutoko farmer's "mhunga" without either of them
// changing how they write.
//
// Two rules this module will not bend on:
//
//   - Resolution is exact-on-normalised-form only. No fuzzy matching, no
//     edit distance, no stemming. Mapping "maize meal" onto "maize" because
//     the strings look similar would silently pair a grain buyer with a
//     miller. An unrecognised term returns null and the caller falls back to
//     category — which is exactly today's behaviour, so nothing regresses.
//   - One normalised term maps to at most one product. Ambiguity is resolved
//     deliberately by adding an alias, never guessed at runtime.
//
// Pure and DB-free. The catalogue below seeds the database; resolution at
// runtime reads the ProductAlias table so farmers' own words can be learned
// without a deploy.

export type ProductKind = "CROP" | "LIVESTOCK";

// Bridges to the existing PostCategory enum so matching can fall back to
// category for anything with no product identity (transport, services,
// inputs).
export type ProductCategory = "PRODUCE" | "LIVESTOCK";

export type SeedProduct = {
  key: string;
  kind: ProductKind;
  category: ProductCategory;
  // The name shown when FarmaTrade has to speak for itself — a market
  // summary, a buyer's requirement with no local wording of its own.
  name: string;
  // Every name this is known by, including the canonical one. Order is not
  // significant; uniqueness is enforced across the whole catalogue.
  aliases: string[];
  // Names in Zimbabwe's other national languages. Kept separate from
  // `aliases` only so they can be reviewed as a group — they resolve
  // identically.
  //
  // NOTE: these are seeded from general knowledge and MUST be checked by a
  // native speaker before the pilot. A wrong word here silently mis-routes a
  // farmer's produce, which is worse than having no local name at all.
  // Aliases are additive rows, so correcting one is a data change, not a
  // deploy.
  localNames?: { sn?: string[]; nd?: string[] };
};

// Zimbabwe's pilot crops and livestock. Deliberately not an attempt at a
// universal agricultural ontology — that is the failure mode this could
// easily slide into. New products are rows, not code.
export const SEED_PRODUCTS: SeedProduct[] = [
  {
    key: "maize",
    kind: "CROP",
    category: "PRODUCE",
    name: "Maize",
    aliases: ["maize", "corn", "white maize", "yellow maize"],
    localNames: { sn: ["chibage"], nd: ["umumbu"] },
  },
  {
    key: "pearl_millet",
    kind: "CROP",
    category: "PRODUCE",
    name: "Pearl millet",
    aliases: ["pearl millet", "bulrush millet", "millet"],
    localNames: { sn: ["mhunga"] },
  },
  {
    key: "finger_millet",
    kind: "CROP",
    category: "PRODUCE",
    name: "Finger millet",
    aliases: ["finger millet", "rapoko"],
    localNames: { sn: ["zviyo"], nd: ["uphoko"] },
  },
  {
    key: "sorghum",
    kind: "CROP",
    category: "PRODUCE",
    name: "Sorghum",
    aliases: ["sorghum"],
    localNames: { sn: ["mapfunde"], nd: ["amabele"] },
  },
  {
    key: "groundnut",
    kind: "CROP",
    category: "PRODUCE",
    name: "Groundnuts",
    aliases: ["groundnut", "groundnuts", "peanut", "peanuts"],
    localNames: { sn: ["nzungu"] },
  },
  {
    key: "bambara_nut",
    kind: "CROP",
    category: "PRODUCE",
    name: "Bambara nuts",
    aliases: ["bambara nut", "bambara nuts", "round nut", "round nuts"],
    localNames: { sn: ["nyimo"] },
  },
  {
    key: "soya_bean",
    kind: "CROP",
    category: "PRODUCE",
    name: "Soya beans",
    aliases: ["soya", "soya bean", "soya beans", "soybean", "soybeans", "soy"],
  },
  {
    key: "sugar_bean",
    kind: "CROP",
    category: "PRODUCE",
    name: "Sugar beans",
    aliases: ["sugar bean", "sugar beans", "beans", "dry beans"],
    localNames: { sn: ["bhinzi"] },
  },
  {
    key: "cowpea",
    kind: "CROP",
    category: "PRODUCE",
    name: "Cowpeas",
    aliases: ["cowpea", "cowpeas"],
    localNames: { sn: ["nyemba"] },
  },
  { key: "wheat", kind: "CROP", category: "PRODUCE", name: "Wheat", aliases: ["wheat"] },
  {
    key: "sunflower",
    kind: "CROP",
    category: "PRODUCE",
    name: "Sunflower",
    aliases: ["sunflower", "sunflower seed", "sunflower seeds"],
  },
  {
    key: "tobacco",
    kind: "CROP",
    category: "PRODUCE",
    name: "Tobacco",
    aliases: ["tobacco", "flue cured tobacco"],
    localNames: { sn: ["fodya"] },
  },
  { key: "cotton", kind: "CROP", category: "PRODUCE", name: "Cotton", aliases: ["cotton"] },
  {
    key: "potato",
    kind: "CROP",
    category: "PRODUCE",
    name: "Potatoes",
    aliases: ["potato", "potatoes", "irish potato", "irish potatoes"],
    localNames: { sn: ["mbatatisi"] },
  },
  {
    key: "sweet_potato",
    kind: "CROP",
    category: "PRODUCE",
    name: "Sweet potatoes",
    aliases: ["sweet potato", "sweet potatoes"],
    localNames: { sn: ["mbambaira"] },
  },
  {
    key: "tomato",
    kind: "CROP",
    category: "PRODUCE",
    name: "Tomatoes",
    aliases: ["tomato", "tomatoes"],
    localNames: { sn: ["madomasi"] },
  },
  {
    key: "onion",
    kind: "CROP",
    category: "PRODUCE",
    name: "Onions",
    aliases: ["onion", "onions"],
    localNames: { sn: ["hanyanisi"] },
  },
  {
    key: "cabbage",
    kind: "CROP",
    category: "PRODUCE",
    name: "Cabbage",
    aliases: ["cabbage", "cabbages"],
    localNames: { sn: ["kabichi"] },
  },
  {
    key: "butternut",
    kind: "CROP",
    category: "PRODUCE",
    name: "Butternut",
    aliases: ["butternut", "butternuts", "squash"],
  },
  {
    key: "orange",
    kind: "CROP",
    category: "PRODUCE",
    name: "Oranges",
    aliases: ["orange", "oranges"],
    localNames: { sn: ["maranjisi"] },
  },
  {
    key: "banana",
    kind: "CROP",
    category: "PRODUCE",
    name: "Bananas",
    aliases: ["banana", "bananas"],
    localNames: { sn: ["mabhanana"] },
  },

  {
    key: "cattle",
    kind: "LIVESTOCK",
    category: "LIVESTOCK",
    name: "Cattle",
    aliases: ["cattle", "cow", "cows", "beef cattle", "bull", "bulls", "heifer", "heifers", "steer", "steers"],
    localNames: { sn: ["mombe"], nd: ["inkomo"] },
  },
  {
    key: "goat",
    kind: "LIVESTOCK",
    category: "LIVESTOCK",
    name: "Goats",
    aliases: ["goat", "goats"],
    localNames: { sn: ["mbudzi"], nd: ["imbuzi"] },
  },
  {
    key: "sheep",
    kind: "LIVESTOCK",
    category: "LIVESTOCK",
    name: "Sheep",
    aliases: ["sheep"],
    localNames: { sn: ["hwai"], nd: ["imvu"] },
  },
  {
    key: "pig",
    kind: "LIVESTOCK",
    category: "LIVESTOCK",
    name: "Pigs",
    aliases: ["pig", "pigs", "swine", "pork"],
    localNames: { sn: ["nguruve"], nd: ["ingulube"] },
  },
  {
    key: "poultry",
    kind: "LIVESTOCK",
    category: "LIVESTOCK",
    name: "Poultry",
    aliases: ["poultry", "chicken", "chickens", "broiler", "broilers", "layer", "layers", "road runner", "road runners"],
    localNames: { sn: ["huku"], nd: ["inkukhu"] },
  },
];

// Lookup form: lowercase, accents folded, punctuation and separators
// stripped, whitespace collapsed. "Crop (type)", "crop_type" and "Crop Type"
// all normalise the same way, and so do "soya-beans" and "Soya Beans".
export function normalizeProductTerm(term: string): string {
  return term
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type AliasEntry = {
  productKey: string;
  normalized: string;
  // Exactly as written, so a farmer's own capitalisation and spelling
  // survive into the UI.
  label: string;
  locale: string | null;
};

// Flattens the catalogue into the alias rows the database stores.
//
// Throws on a duplicate normalised term rather than silently letting one
// product win. A term that genuinely belongs to two products is a modelling
// decision someone has to make — "millet" resolving to pearl millet rather
// than finger millet is a choice, and it should be a visible one.
export function seedAliases(products: SeedProduct[] = SEED_PRODUCTS): AliasEntry[] {
  const entries: AliasEntry[] = [];
  const claimed = new Map<string, string>();

  const add = (productKey: string, label: string, locale: string | null) => {
    const normalized = normalizeProductTerm(label);
    if (!normalized) return;
    const existing = claimed.get(normalized);
    if (existing && existing !== productKey) {
      throw new Error(
        `Alias "${label}" is claimed by both ${existing} and ${productKey}. ` +
          `Resolve this deliberately rather than letting one win.`,
      );
    }
    if (existing === productKey) return;
    claimed.set(normalized, productKey);
    entries.push({ productKey, normalized, label, locale });
  };

  for (const product of products) {
    add(product.key, product.name, "en");
    for (const alias of product.aliases) add(product.key, alias, "en");
    for (const alias of product.localNames?.sn ?? []) add(product.key, alias, "sn");
    for (const alias of product.localNames?.nd ?? []) add(product.key, alias, "nd");
  }

  return entries;
}

export type ProductIndex = Map<string, string>;

// Normalised term → product key. Built once from alias rows and reused.
export function buildProductIndex(aliases: { normalized: string; productKey: string }[]): ProductIndex {
  return new Map(aliases.map((a) => [a.normalized, a.productKey]));
}

// The product a farmer's own words refer to, or null when we don't know.
//
// Null is a first-class answer. A term we can't place falls back to
// category-level matching — today's behaviour — rather than being forced
// into the nearest-looking product.
export function resolveProductKey(term: string | null | undefined, index: ProductIndex): string | null {
  if (!term) return null;
  return index.get(normalizeProductTerm(term)) ?? null;
}

// Strips a leading quantity-and-unit preamble from a title.
//
// FarmaTrade writes titles itself in exactly this shape — harvest drafts
// produce "3 tonnes of Oranges", and the inventory picker prefills the same
// way — so parsing its own format back is reading structure, not guessing.
//
// Deliberately narrow. It removes a leading number, an optional unit word,
// and an optional "of", and nothing else. It does NOT hunt for a known
// product somewhere inside free text: "maize meal" would find "maize" and
// pair a grain buyer with a miller, which is precisely the failure the
// exact-match rule exists to prevent.
export function subjectFromTitle(title: string): string {
  return title
    .trim()
    .replace(
      /^\s*\d+(?:[.,]\d+)?\s*(kgs?|tonnes?|tons?|bags?|crates?|litres?|liters?|head|units?|pieces?)?\s*(of\s+)?/i,
      "",
    )
    .trim();
}

// Resolves a title by trying it whole, then with a quantity preamble
// stripped. Still exact on both attempts.
export function resolveProductFromTitle(title: string, index: ProductIndex): string | null {
  return resolveProductKey(title, index) ?? resolveProductKey(subjectFromTitle(title), index);
}

// Whether two sides of a potential match are about the same thing.
//
// Unknown on either side means "can't rule it out" — the pair falls through
// to the category check that has always governed it. Only two *known and
// different* products are disqualifying. That asymmetry is what lets this
// ship without invalidating every existing post.
export function productsCompatible(a: string | null, b: string | null): boolean {
  if (a == null || b == null) return true;
  return a === b;
}

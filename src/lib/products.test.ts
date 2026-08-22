import { describe, expect, it } from "vitest";
import {
  SEED_PRODUCTS,
  buildProductIndex,
  normalizeProductTerm,
  productsCompatible,
  resolveProductKey,
  seedAliases,
} from "./products";

const index = buildProductIndex(seedAliases());

describe("normalizeProductTerm", () => {
  it("folds case, punctuation and spacing to one lookup form", () => {
    const forms = ["Soya Beans", "soya-beans", "SOYA_BEANS", "  soya   beans  ", "Soya (beans)"];
    expect(new Set(forms.map(normalizeProductTerm)).size).toBe(1);
  });

  it("folds accents, so a farmer's keyboard doesn't decide whether they match", () => {
    expect(normalizeProductTerm("Manióc")).toBe(normalizeProductTerm("manioc"));
  });
});

describe("the seed catalogue", () => {
  it("never lets one term mean two products", () => {
    // seedAliases throws rather than picking a winner, so simply building it
    // is the assertion.
    expect(() => seedAliases()).not.toThrow();
  });

  it("gives every product a unique key", () => {
    const keys = SEED_PRODUCTS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("resolves each product by its own canonical name", () => {
    for (const product of SEED_PRODUCTS) {
      expect(resolveProductKey(product.name, index), product.name).toBe(product.key);
    }
  });

  it("puts crops in PRODUCE and livestock in LIVESTOCK", () => {
    for (const product of SEED_PRODUCTS) {
      expect(product.category, product.key).toBe(
        product.kind === "LIVESTOCK" ? "LIVESTOCK" : "PRODUCE",
      );
    }
  });
});

describe("resolveProductKey", () => {
  it("resolves the names this product was built for", () => {
    // The two the brief named explicitly.
    expect(resolveProductKey("Mhunga", index)).toBe("pearl_millet");
    expect(resolveProductKey("pearl millet", index)).toBe("pearl_millet");
    expect(resolveProductKey("Mombe", index)).toBe("cattle");
    expect(resolveProductKey("cattle", index)).toBe("cattle");
    expect(resolveProductKey("Nyimo", index)).toBe("bambara_nut");
  });

  it("leaves generic millet unresolved instead of choosing a variety", () => {
    expect(resolveProductKey("millet", index)).toBeNull();
    expect(resolveProductKey("pearl millet", index)).toBe("pearl_millet");
    expect(resolveProductKey("finger millet", index)).toBe("finger_millet");
  });

  it("lets a buyer's English find a farmer's Shona", () => {
    expect(resolveProductKey("chibage", index)).toBe(resolveProductKey("maize", index));
    expect(resolveProductKey("mbudzi", index)).toBe(resolveProductKey("goats", index));
    expect(resolveProductKey("amabele", index)).toBe(resolveProductKey("sorghum", index));
  });

  it("is case- and spacing-insensitive, since farmers type freely", () => {
    expect(resolveProductKey("  SOYA BEANS ", index)).toBe("soya_bean");
    expect(resolveProductKey("Sweet-Potatoes", index)).toBe("sweet_potato");
  });

  it("returns null for a term it doesn't know, rather than guessing", () => {
    // "maize meal" is milled product, not grain. Fuzzy matching would pair a
    // grain buyer with a miller; exact-on-normalised refuses to.
    expect(resolveProductKey("maize meal", index)).toBeNull();
    expect(resolveProductKey("mazoe crush", index)).toBeNull();
    expect(resolveProductKey("", index)).toBeNull();
    expect(resolveProductKey(null, index)).toBeNull();
  });
});

describe("productsCompatible", () => {
  it("is the bug this whole layer exists to fix", () => {
    const maize = resolveProductKey("maize", index);
    const tomato = resolveProductKey("tomatoes", index);
    expect(productsCompatible(maize, tomato)).toBe(false);
  });

  it("matches a farmer's Shona against a buyer's English", () => {
    expect(
      productsCompatible(resolveProductKey("mhunga", index), resolveProductKey("pearl millet", index)),
    ).toBe(true);
  });

  it("treats unknown on either side as 'can't rule it out'", () => {
    // Existing posts predate the catalogue, and transport has no product at
    // all. Neither may stop matching.
    expect(productsCompatible(null, "maize")).toBe(true);
    expect(productsCompatible("maize", null)).toBe(true);
    expect(productsCompatible(null, null)).toBe(true);
  });
});

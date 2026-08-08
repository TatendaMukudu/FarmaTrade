import { describe, expect, it } from "vitest";
import { parseCsv, normalizeRow } from "./csv";

describe("parseCsv", () => {
  it("parses a simple header + rows into records", () => {
    const rows = parseCsv("species,quantity\nCATTLE,5\nGOAT,10\n");
    expect(rows).toEqual([
      { species: "CATTLE", quantity: "5" },
      { species: "GOAT", quantity: "10" },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("handles quoted fields containing commas", () => {
    const rows = parseCsv('name,notes\n"Tractor 1","Good condition, needs fuel"\n');
    expect(rows).toEqual([{ name: "Tractor 1", notes: "Good condition, needs fuel" }]);
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    const rows = parseCsv('name,notes\nCow,"She said ""moo"""\n');
    expect(rows).toEqual([{ name: "Cow", notes: 'She said "moo"' }]);
  });

  it("handles CRLF line endings", () => {
    const rows = parseCsv("a,b\r\n1,2\r\n");
    expect(rows).toEqual([{ a: "1", b: "2" }]);
  });

  it("skips fully blank rows", () => {
    const rows = parseCsv("a,b\n1,2\n,\n3,4\n");
    expect(rows).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("trims whitespace around headers and values", () => {
    const rows = parseCsv(" a , b \n 1 , 2 \n");
    expect(rows).toEqual([{ a: "1", b: "2" }]);
  });

  it("fills missing trailing fields with an empty string", () => {
    const rows = parseCsv("a,b,c\n1,2\n");
    expect(rows).toEqual([{ a: "1", b: "2", c: "" }]);
  });
});

describe("normalizeRow", () => {
  it("matches headers case-insensitively and ignoring spaces/underscores/hyphens", () => {
    const result = normalizeRow(
      { "Crop Type": "Maize", quantity_kg: "50", "expected-harvest": "2026-01-01" },
      ["cropType", "quantityKg", "expectedHarvest"],
    );
    expect(result).toEqual({
      cropType: "Maize",
      quantityKg: "50",
      expectedHarvest: "2026-01-01",
    });
  });

  it("drops columns that don't match any known field name", () => {
    const result = normalizeRow({ cropType: "Maize", mystery: "???" }, ["cropType"]);
    expect(result).toEqual({ cropType: "Maize" });
  });
});

// A farmer's own spreadsheet, not a machine export. Nobody keeps records in
// a column called "cropType".
describe("normalizeRow header synonyms", () => {
  const PRODUCE = ["cropType", "quantity", "unit", "perishable", "expectedHarvestDate", "notes"];
  const LIVESTOCK = ["species", "breed", "sex", "quantity", "notes"];

  it("recognises the words farmers actually write", () => {
    expect(
      normalizeRow({ Crop: "Mhunga", Qty: "12", Units: "TONNE" }, PRODUCE),
    ).toEqual({ cropType: "Mhunga", quantity: "12", unit: "TONNE" });
  });

  it("keeps a native crop name exactly as typed", () => {
    expect(normalizeRow({ Item: "Nyimo", Amount: "3" }, PRODUCE).cropType).toBe("Nyimo");
  });

  it("reads 'Head' as a count on a livestock sheet", () => {
    expect(normalizeRow({ Animal: "CATTLE", Head: "18" }, LIVESTOCK)).toEqual({
      species: "CATTLE",
      quantity: "18",
    });
  });

  it("resolves an ambiguous header against the sheet it is on", () => {
    // "Type" means the crop on a produce sheet and the animal on a
    // livestock one. Only one field set is ever in play.
    expect(normalizeRow({ Type: "Maize" }, PRODUCE)).toEqual({ cropType: "Maize" });
    expect(normalizeRow({ Type: "GOAT" }, LIVESTOCK)).toEqual({ species: "GOAT" });
  });

  it("lets an exact header win over another column's synonym", () => {
    const row = normalizeRow({ cropType: "Maize", Item: "something else" }, PRODUCE);
    expect(row.cropType).toBe("Maize");
  });

  it("tolerates punctuation and spacing in headers", () => {
    expect(normalizeRow({ "Crop (type)": "Sorghum", "Harvest date": "2026-09-01" }, PRODUCE)).toEqual({
      cropType: "Sorghum",
      expectedHarvestDate: "2026-09-01",
    });
  });

  it("ignores a column it does not recognise rather than guessing", () => {
    expect(normalizeRow({ "Paddock number": "7", Crop: "Maize" }, PRODUCE)).toEqual({
      cropType: "Maize",
    });
  });
});

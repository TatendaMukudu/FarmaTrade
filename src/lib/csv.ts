// Minimal RFC4180-ish CSV parser (quoted fields, escaped "" quotes,
// CRLF/LF). Written in-house rather than pulling in a parsing library —
// the npm `xlsx` package (the obvious choice for spreadsheet import) has an
// unpatched high-severity prototype-pollution/ReDoS advisory with no fix,
// and CSV is what every spreadsheet app can export anyway.
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseRows(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, i) => {
        record[header] = (row[i] ?? "").trim();
      });
      return record;
    });
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// What farmers actually call these columns.
//
// The importer used to require headers that matched our field names once
// case and spacing were stripped, which meant a farmer's own spreadsheet --
// the whole point of the feature -- usually imported as nothing. Nobody
// keeps records in a column called "cropType". They write "Crop", "Item",
// "Qty", "Head", "Number of animals".
//
// So the canonical name is one entry in a list of accepted spellings rather
// than the only one. This is a lookup table, deliberately: guessing columns
// by content would silently mis-map a farmer's data, and silently wrong is
// far worse here than "we didn't recognise this column".
const HEADER_SYNONYMS: Record<string, string[]> = {
  cropType: ["crop", "croptype", "produce", "product", "item", "itemname", "name", "type", "commodity", "variety"],
  species: ["species", "animal", "animaltype", "livestock", "type", "kind"],
  breed: ["breed", "variety", "strain"],
  sex: ["sex", "gender"],
  quantity: ["quantity", "qty", "amount", "number", "count", "head", "numberofanimals", "howmany", "total", "volume"],
  unit: ["unit", "units", "measure", "measurement", "uom"],
  perishable: ["perishable", "perishes", "spoils"],
  expectedHarvestDate: ["expectedharvestdate", "harvestdate", "harvest", "expectedharvest", "readyby", "duedate", "ready"],
  notes: ["notes", "note", "comment", "comments", "remarks", "description"],
  name: ["name", "item", "itemname", "equipment", "machine", "asset", "description"],
  category: ["category", "type", "kind", "class"],
  condition: ["condition", "state", "status"],
  available: ["available", "inuse", "isavailable", "usable"],
};

function canonicalKey(header: string): string {
  return header.toLowerCase().replace(/[\s_\-.()/]/g, "");
}

// Matches spreadsheet headers to canonical field names, tolerant of case,
// spacing and punctuation ("Crop Type", "crop_type", "Crop (type)" all
// resolve to "cropType"), and of the words farmers actually use ("Qty" and
// "Head" both resolve to "quantity").
//
// `fieldNames` scopes which synonyms are live, which is what keeps ambiguous
// words safe: "type" means the crop on a produce sheet and the species on a
// livestock one, and only one of those field sets is ever in play. An exact
// match always wins over a synonym, so a sheet with both "Name" and "Item"
// columns maps each to the field it literally names.
export function normalizeRow(
  row: Record<string, string>,
  fieldNames: string[],
): Record<string, string> {
  const exact = new Map(fieldNames.map((f) => [canonicalKey(f), f]));
  const synonyms = new Map<string, string>();
  for (const field of fieldNames) {
    for (const alias of HEADER_SYNONYMS[field] ?? []) {
      // First field in `fieldNames` to claim an alias keeps it, so the
      // mapping is deterministic rather than dependent on object order.
      if (!synonyms.has(alias) && !exact.has(alias)) synonyms.set(alias, field);
    }
  }

  const result: Record<string, string> = {};
  const claimed = new Set<string>();
  // Two passes so an exact header match is never beaten by another column's
  // synonym.
  for (const [header, value] of Object.entries(row)) {
    const field = exact.get(canonicalKey(header));
    if (field) {
      result[field] = value;
      claimed.add(field);
    }
  }
  for (const [header, value] of Object.entries(row)) {
    const field = synonyms.get(canonicalKey(header));
    if (field && !claimed.has(field)) {
      result[field] = value;
      claimed.add(field);
    }
  }
  return result;
}

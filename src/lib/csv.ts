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

// Matches CSV headers to canonical field names, tolerant of case,
// surrounding space, and spaces/underscores inside the header
// ("Crop Type", "crop_type", "croptype" all resolve to "cropType").
export function normalizeRow(
  row: Record<string, string>,
  fieldNames: string[],
): Record<string, string> {
  const byNormalizedKey = new Map(fieldNames.map((f) => [f.toLowerCase().replace(/[\s_-]/g, ""), f]));
  const result: Record<string, string> = {};
  for (const [header, value] of Object.entries(row)) {
    const key = header.toLowerCase().replace(/[\s_-]/g, "");
    const field = byNormalizedKey.get(key);
    if (field) result[field] = value;
  }
  return result;
}

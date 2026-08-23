export type LegacyTradeParams = Record<string, string | string[] | undefined>;

// Preserve old bookmarks without preserving old domain vocabulary. A NEED
// bookmark must still open a demand form; forwarding it unchanged would make
// the new page default to supply.
export function normalizeLegacyTradeParams(params: LegacyTradeParams): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (raw == null) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (key === "type") {
      if (value === "HAVE") query.set("side", "SUPPLY");
      if (value === "NEED") query.set("side", "DEMAND");
      continue;
    }
    query.set(key, value);
  }
  return query;
}

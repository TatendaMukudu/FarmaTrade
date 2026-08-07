export const ZIMBABWE_PROVINCES = [
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

// Suggested, not enforced (Post.currency is a plain string, same reasoning
// as `unit`) — USD for larger/cross-border deals, ZiG as the local
// currency, ZAR common in border trade with South Africa.
export const CURRENCIES = ["USD", "ZiG", "ZAR"] as const;

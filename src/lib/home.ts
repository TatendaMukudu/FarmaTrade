// Home speaks first about what FarmaTrade found, not about administration.
//
// The exact threshold for calling an opportunity "strong" belongs to the
// unresolved ranking policy. Until that policy exists, the honest claim is
// only that these are the selective top results FarmaTrade found.
export function opportunityHeadline(count: number): string {
  return `${count} ${count === 1 ? "opportunity" : "opportunities"} found`;
}

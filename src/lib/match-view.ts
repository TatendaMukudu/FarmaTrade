// Pure view-layer helpers over an already-fetched Match — no DB access here,
// this is exactly the "feeds the UI, isn't written inside it" seam: every
// page that renders a match (Opportunities, Overview, a Conversation) was
// re-deriving "which side is mine" and "how far away is this" by hand.

// A Match's postA/postB are interchangeable — "mine" depends on the viewer,
// not on which side is A. Generic so each call site keeps whatever `include`
// shape it fetched (party, photos, reputation, ...) on both sides.
export function resolveMatchSides<P extends { partyId: string }>(
  match: { postA: P; postB: P },
  partyId: string,
): { yours: P; theirs: P } {
  const mine = match.postA.partyId === partyId;
  return { yours: mine ? match.postA : match.postB, theirs: mine ? match.postB : match.postA };
}

export function isPartyInMatch(
  match: { postA: { partyId: string }; postB: { partyId: string } },
  partyId: string,
): boolean {
  return match.postA.partyId === partyId || match.postB.partyId === partyId;
}

// district match beats province match beats "just the province name" — a
// deterministic proxy for physical distance until Party carries real
// coordinates worth ranking on.
export function distanceLabel(
  theirDistrict: string,
  theirProvince: string,
  myDistrict: string,
  myProvince: string,
): string {
  if (theirDistrict === myDistrict) return "Same district";
  if (theirProvince === myProvince) return "Same province";
  return theirProvince;
}

// Decimal (Prisma) askingPrice × quantity when both are present, else just
// the price, else nothing worth showing.
export function estimatedPostValue(post: {
  askingPrice: unknown;
  quantity: number | null;
}): number | null {
  if (post.askingPrice == null) return null;
  const price = Number(post.askingPrice);
  return post.quantity != null ? price * post.quantity : price;
}

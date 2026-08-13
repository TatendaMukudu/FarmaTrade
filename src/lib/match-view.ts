// Pure view-layer helpers over an already-fetched Match — no DB access here,
// this is exactly the "feeds the UI, isn't written inside it" seam: every
// page that renders a match (Opportunities, Overview, a Conversation) was
// re-deriving "which side is mine" and "how far away is this" by hand.

// A Match's intentA/intentB are the Match table's own column names and stay
// that way until the physical rename; the domain word for what they point
// at is Intent (see lib/intent.ts). They are interchangeable — "mine"
// depends on the viewer,
// not on which side is A. Generic so each call site keeps whatever `include`
// shape it fetched (party, photos, reputation, ...) on both sides.
export function resolveMatchSides<P extends { partyId: string }>(
  match: { intentA: P; intentB: P },
  partyId: string,
): { yours: P; theirs: P } {
  const mine = match.intentA.partyId === partyId;
  return { yours: mine ? match.intentA : match.intentB, theirs: mine ? match.intentB : match.intentA };
}

// Groups matches by *your* post rather than listing every match flatly —
// a buyer's single NEED post can have many small candidates, and seeing
// them scattered across separate cards hides that they might, together,
// actually cover the order. Order of first appearance is preserved, so
// grouping doesn't fight the existing score-desc sort.
export function groupMatchesByOwnIntent<P extends { id: string; partyId: string }, M extends { intentA: P; intentB: P }>(
  matches: M[],
  partyId: string,
): { yours: P; matches: M[] }[] {
  const order: string[] = [];
  const groups = new Map<string, { yours: P; matches: M[] }>();
  for (const m of matches) {
    const { yours } = resolveMatchSides<P>(m, partyId);
    if (!groups.has(yours.id)) {
      groups.set(yours.id, { yours, matches: [] });
      order.push(yours.id);
    }
    groups.get(yours.id)!.matches.push(m);
  }
  return order.map((id) => groups.get(id)!);
}

// Sum of what the other side of each match still has available — only
// meaningful once matches are grouped by your own DEMAND intent (see above).
//
// Takes REMAINING capacity per counterparty rather than their headline
// quantity, which is the difference between a useful number and a
// misleading one: a supplier offering 40 tonnes who has already agreed 35 of
// them contributes 5 to a buyer's coverage. Adding the 40 would tell the
// buyer their order was covered when most of it is spoken for elsewhere.
//
// `remainingFor` returns null where a counterparty declared no ceiling.
// Those are counted separately rather than as zero — "three suppliers, two
// of whom did not say how much" is honest; silently treating them as nothing
// is not.
export function combinedOfferedQuantity<
  P extends { id: string; partyId: string; quantity: number | null },
  M extends { intentA: P; intentB: P },
>(
  matches: M[],
  partyId: string,
  remainingFor: (intent: P) => number | null,
): { total: number; unbounded: number } {
  let total = 0;
  let unbounded = 0;
  for (const m of matches) {
    const { theirs } = resolveMatchSides<P>(m, partyId);
    const remaining = remainingFor(theirs);
    if (remaining === null) unbounded++;
    else total += remaining;
  }
  return { total, unbounded };
}

export function isPartyInMatch(
  match: { intentA: { partyId: string }; intentB: { partyId: string } },
  partyId: string,
): boolean {
  return match.intentA.partyId === partyId || match.intentB.partyId === partyId;
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
export function estimatedIntentValue(post: {
  askingPrice: unknown;
  quantity: number | null;
}): number | null {
  if (post.askingPrice == null) return null;
  const price = Number(post.askingPrice);
  return post.quantity != null ? price * post.quantity : price;
}

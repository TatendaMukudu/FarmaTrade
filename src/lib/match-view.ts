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

// Groups matches by *your* post rather than listing every match flatly —
// a buyer's single NEED post can have many small candidates, and seeing
// them scattered across separate cards hides that they might, together,
// actually cover the order. Order of first appearance is preserved, so
// grouping doesn't fight the existing score-desc sort.
export function groupMatchesByOwnPost<P extends { id: string; partyId: string }, M extends { postA: P; postB: P }>(
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

// Sum of what the other side of each match is offering — only meaningful
// once matches are grouped by your own NEED post (see above).
export function combinedOfferedQuantity<
  P extends { id: string; partyId: string; quantity: number | null },
  M extends { postA: P; postB: P },
>(matches: M[], partyId: string): number {
  return matches.reduce((sum, m) => {
    const { theirs } = resolveMatchSides<P>(m, partyId);
    return sum + (theirs.quantity ?? 0);
  }, 0);
}

export function isPartyInMatch(
  match: { postA: { partyId: string }; postB: { partyId: string } },
  partyId: string,
): boolean {
  return match.postA.partyId === partyId || match.postB.partyId === partyId;
}

// locality match beats region match beats "just the region name" — a
// deterministic proxy for physical distance until Party carries real
// coordinates worth ranking on.
export function distanceLabel(
  theirDistrict: string,
  theirProvince: string,
  myDistrict: string,
  myProvince: string,
): string {
  if (theirDistrict === myDistrict) return "Same locality";
  if (theirProvince === myProvince) return "Same region";
  return theirProvince;
}

// Decimal (Prisma) askingPrice × quantity when both are present, else just
// the price, else nothing worth showing. Returns the currency alongside
// the amount — every post carries its own (defaulting to USD), so a
// display that only ever showed a bare "$" was silently assuming every
// price was USD in a market that also runs on ZiG and, in border trade,
// ZAR.
export function estimatedPostValue(post: {
  askingPrice: unknown;
  quantity: number | null;
  currency: string;
}): { amount: number; currency: string } | null {
  if (post.askingPrice == null) return null;
  const price = Number(post.askingPrice);
  const amount = post.quantity != null ? price * post.quantity : price;
  return { amount, currency: post.currency };
}

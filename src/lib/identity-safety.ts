import "server-only";
import { prisma } from "@/lib/prisma";

// Who may see whose personal contact details.
//
// PRODUCT_TRUTH.md §29, INV-14: before a commercial relationship exists,
// FarmaTrade exposes ECONOMIC identity — farm name, reputation, trade
// history, verification — and not PERSONAL identity. A phone number is
// personal identity, and until this module existed any signed-in party
// could read one by opening a profile.
//
// The rule lives here rather than inline in a page because it is product
// truth, not presentation. A page that decides for itself who may see a
// phone number is a page that can be copied without the rule.
//
// WHAT THIS DELIBERATELY DOES NOT DECIDE
//
// §57 item 15 — the exact circumstances in which contact information
// unlocks — is UNRESOLVED. A mutually agreed engagement is the narrowest
// relationship the domain can currently express, so it is what this uses:
// it satisfies the DECIDED half (a stranger cannot see it) while committing
// to as little as possible about the starred half.
//
// It is expected to widen. When §23's Network lands, a connection is an
// obvious candidate. When it does, this function changes and nothing else
// needs to.

export async function canSeeContactDetails(
  viewerId: string | null | undefined,
  subjectId: string,
): Promise<boolean> {
  if (!viewerId) return false;
  // Your own profile is yours.
  if (viewerId === subjectId) return true;

  // A mutually agreed engagement — not a suggestion, not a negotiation, not
  // one party's interest. The same bar P0.4 set for consuming capacity: both
  // parties accepted the same terms.
  const agreed = await prisma.match.count({
    where: {
      status: { in: ["AGREED", "COMPLETED"] },
      OR: [
        { intentA: { partyId: viewerId }, intentB: { partyId: subjectId } },
        { intentA: { partyId: subjectId }, intentB: { partyId: viewerId } },
      ],
    },
  });
  return agreed > 0;
}

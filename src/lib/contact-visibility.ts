import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";

// Progressive disclosure of contact details.
//
// Before this, the party profile rendered `phone` and `contactDetails` to
// any signed-in user. One throwaway email and a loop over /dashboard/
// directory/<id> harvested every farmer's phone number on the platform —
// which is a lead list to sell, a spam list to blast, and in a market where
// people are targeted for what they're known to be holding, a safety
// problem rather than only a privacy one.
//
// Every serious marketplace solves this the same way: identity is public,
// reachability is earned. You see who someone is, their history and what
// they're offering; you get their phone number when there is a real reason
// to call them — here, when a match between you has been accepted.
//
// Deliberately *not* enforced by remembering to redact at each call site.
// `visibleContactFor` is the only way to get these fields, and it decides.

export type ContactVisibility =
  | { canSee: true; reason: "self" | "accepted_match" }
  | { canSee: false; reason: "no_relationship" };

// A single accepted or completed match between the two parties is the
// unlock. SUGGESTED isn't enough — a suggestion is the platform's opinion,
// not a relationship either side agreed to.
async function computeVisibility(
  viewerPartyId: string,
  subjectPartyId: string,
): Promise<ContactVisibility> {
  if (viewerPartyId === subjectPartyId) return { canSee: true, reason: "self" };

  const match = await prisma.match.findFirst({
    where: {
      status: { in: ["ACCEPTED", "COMPLETED"] },
      OR: [
        { postA: { partyId: viewerPartyId }, postB: { partyId: subjectPartyId } },
        { postA: { partyId: subjectPartyId }, postB: { partyId: viewerPartyId } },
      ],
    },
    select: { id: true },
  });

  return match
    ? { canSee: true, reason: "accepted_match" }
    : { canSee: false, reason: "no_relationship" };
}

// Request-scoped, same reasoning as getCurrentParty: a page that renders a
// profile alongside a conversation would otherwise ask twice per render.
export const contactVisibility = cache(computeVisibility);

export type VisibleContact =
  | { visible: true; phone: string | null; contactDetails: string | null }
  | { visible: false; hint: string };

// The only supported way to read another party's contact fields. Returns
// either the values or the reason they're withheld — never the raw fields
// for a caller to decide about, because "decide at the call site" is how
// the leak happened in the first place.
export async function visibleContactFor(
  viewer: { id: string },
  subject: { id: string; phone: string | null; contactDetails: string | null },
): Promise<VisibleContact> {
  const visibility = await contactVisibility(viewer.id, subject.id);

  if (!visibility.canSee) {
    return {
      visible: false,
      hint: "Contact details are shared once you and this party accept a match.",
    };
  }

  // Auditing the reveal, not the page view: this is the moment one person's
  // phone number reaches another, and it's the record that makes a
  // scraping pattern visible after the fact instead of invisible forever.
  // Self-views aren't logged — that's just someone reading their own profile.
  if (visibility.reason === "accepted_match" && (subject.phone || subject.contactDetails)) {
    await recordAudit({
      action: "CONTACT_REVEALED",
      partyId: viewer.id,
      subjectId: subject.id,
    });
  }

  return { visible: true, phone: subject.phone, contactDetails: subject.contactDetails };
}

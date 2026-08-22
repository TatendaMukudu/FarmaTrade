// Farm state may propose commercial intent. People decide what becomes
// market-active.
//
// Three layers, and the boundaries between them are the whole point:
//
//   STATE        26 tonnes of maize, expected around 20 September
//   PROPOSAL     FarmaTrade's reading of that as a commercial opportunity
//   PARTICIPATION the owner permitting it to take part in matching
//
// FarmaTrade owns the middle layer and only the middle layer. It may create
// a proposal, and it may revise one nobody has touched. It may never move
// one to ACTIVE — that is a person's decision about their own commerce, and
// making it on their behalf would be the single most damaging thing this
// system could do.
//
// The ownership rule, stated once so the rest of the file can lean on it:
//
//   DERIVED + PROPOSED   FarmaTrade owns it. Source changes revise it.
//   anything ACTIVE      the owner owns it. Source changes raise a flag and
//                        change nothing.
//
// That asymmetry is what stops a farmer's expected harvest dropping from 26
// to 15 tonnes and silently rewriting a commitment they already made to the
// market.
//
// Pure and DB-free.

import type { IntentOrigin, IntentStatus } from "@/generated/prisma/client";

// How close a harvest has to be before proposing anything. Far enough out
// and a proposal is noise; too close and it is useless.
export const HARVEST_WINDOW_DAYS = 7;

// A fact about the farm that could become commercial availability.
//
// One shape today, from the produce/harvest path. The other sources — idle
// equipment, unused land, expiring stock, recurring buyer demand — are the
// same shape with a different `kind`, which is why this is a discriminated
// type rather than a produce-specific function signature. They are
// deliberately not implemented yet: this proves the pattern on one path.
export type SourceState = {
  kind: "PRODUCE_HARVEST";
  sourceId: string;
  productId: string | null;
  // The farmer's own word for it, exactly as recorded.
  label: string;
  quantity: number;
  unit: string;
  availableFrom: Date | null;
  perishable: boolean;
};

// What FarmaTrade would propose, if the owner agrees.
export type Proposal = {
  sourceId: string;
  derivationKey: string;
  productId: string | null;
  label: string;
  // The ceiling, not a recommendation. See proposedAvailability().
  quantity: number;
  unit: string;
  availableFrom: Date | null;
  urgent: boolean;
  // Why FarmaTrade thinks this, in a farmer's own terms. Deterministic
  // prose assembled from the source facts — never generated, never inferred.
  basis: string;
};

// How much to propose making available.
//
// Currently: all of it, as a ceiling the farmer reduces. That is the honest
// default, because FarmaTrade genuinely does not know how much a household
// keeps back for its own use, and inventing a reserve fraction — "we'll
// suggest 77%" — would be pretending to knowledge nobody has. Proposing the
// full amount and labelling it "up to" puts the real number in front of the
// farmer and lets them do the one piece of arithmetic only they can do.
//
// This is the seam where a learned or configured reserve rule plugs in
// later: once farmers have activated derived proposals a few times, the gap
// between what was proposed and what they actually offered is exactly the
// signal that would justify a smarter default.
export function proposedAvailability(source: SourceState): number {
  return source.quantity;
}

function isoDay(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "none";
}

// A fingerprint of the source facts that a proposal depends on.
//
// Two purposes, both of which need it to be exact rather than approximate:
//
//   - A proposal whose key still matches its source has not gone stale, so
//     there is nothing to revise.
//   - A proposal the farmer declined stays declined for as long as the key
//     is unchanged. If the underlying harvest genuinely changes, that is a
//     different commercial question and asking again is fair.
//
// Quantity, timing, identity and unit are in the key because each of them
// changes what is being offered. Nothing else is: a farmer editing their
// private notes should not resurrect a proposal they turned down.
export function derivationKeyFor(source: SourceState): string {
  return [
    source.kind,
    source.sourceId,
    source.productId ?? "unidentified",
    source.label.trim().toLowerCase(),
    source.quantity,
    source.unit.trim().toLowerCase(),
    isoDay(source.availableFrom),
  ].join("|");
}

// The sentence answering "why are you suggesting this?" — assembled from
// the source facts, in the farmer's own words for the crop.
export function basisFor(source: SourceState, formatQuantity: (q: number, u: string) => string): string {
  const when = source.availableFrom
    ? ` around ${source.availableFrom.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
    : "";
  return `Based on your recorded ${source.label.toLowerCase()}: ${formatQuantity(source.quantity, source.unit)} expected${when}.`;
}

export function proposalFor(
  source: SourceState,
  formatQuantity: (q: number, u: string) => string,
): Proposal {
  return {
    sourceId: source.sourceId,
    derivationKey: derivationKeyFor(source),
    productId: source.productId,
    label: source.label,
    quantity: proposedAvailability(source),
    unit: source.unit,
    availableFrom: source.availableFrom,
    // Perishable produce is time-sensitive by nature, not by the farmer
    // having said so.
    urgent: source.perishable,
    basis: basisFor(source, formatQuantity),
  };
}

// How much the recorded amount must move before a declined proposal counts
// as a genuinely different commercial question.
//
// A farmer re-weighing a crop from 26 to 26.4 tonnes has not changed their
// mind about selling it, and re-asking would be nagging dressed up as
// responsiveness. A harvest that comes in at 40 is a different proposition
// and worth one more question.
export const MATERIAL_QUANTITY_CHANGE = 0.1;

// An intent already derived from this source, as far as the decision needs
// to know about it.
export type ExistingDerived = {
  id: string;
  origin: IntentOrigin;
  status: IntentStatus;
  derivationKey: string | null;
  // Only read for withdrawn rows, to judge whether a decline still applies.
  quantity: number | null;
  productId: string | null;
};

// Whether a decline still covers what is now being proposed.
//
// Deliberately coarser than the derivation key. "Not selling this" is a
// statement about the maize, not about 26 tonnes of it on the 20th — so a
// date drifting, a crop being relabelled, or a unit being corrected must not
// resurrect the question. Only the product changing, or the amount changing
// materially, makes it a new one.
export function declineStillApplies(declined: ExistingDerived, proposal: Proposal): boolean {
  if (declined.productId !== proposal.productId) return false;
  if (declined.quantity == null) return true;
  if (declined.quantity === 0) return proposal.quantity === 0;
  const change = Math.abs(proposal.quantity - declined.quantity) / declined.quantity;
  return change <= MATERIAL_QUANTITY_CHANGE;
}

export type DerivationDecision =
  | { action: "create"; proposal: Proposal }
  // The proposal is stale and nobody has claimed it, so FarmaTrade may
  // update it in place.
  | { action: "revise"; intentId: string; proposal: Proposal }
  // The owner activated it and the source has since moved. Their commercial
  // terms are theirs; this only raises the question.
  | { action: "flag_divergence"; intentId: string; proposal: Proposal }
  | {
      action: "skip";
      reason: "declined_unchanged" | "proposal_current" | "owner_controlled" | "outside_window";
    };

function withinWindow(source: SourceState, now: Date): boolean {
  if (!source.availableFrom) return false;
  const days = (source.availableFrom.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
  return days <= HARVEST_WINDOW_DAYS;
}

// What to do about one source, given what already exists for it.
//
// The `existing` list is every intent already derived from this source,
// whatever its status — including ones the farmer withdrew, because a
// withdrawal is what suppression is made of.
export function decide(
  source: SourceState,
  existing: ExistingDerived[],
  now: Date,
  formatQuantity: (q: number, u: string) => string,
): DerivationDecision {
  const proposal = proposalFor(source, formatQuantity);

  // A farmer who said "not selling this" gets asked again only when the
  // proposition has materially changed. Checked before the window, so a
  // decline holds even if the harvest date drifts back into range — a
  // decline is about the offer, not about the calendar.
  const declined = existing.find(
    (e) => e.status === "WITHDRAWN" && declineStillApplies(e, proposal),
  );
  if (declined) return { action: "skip", reason: "declined_unchanged" };

  // Anything the owner has taken control of stays theirs. FarmaTrade may
  // point out that the source has moved; it may not act on it.
  const owned = existing.find((e) => e.status === "ACTIVE" || e.status === "ENGAGED");
  if (owned) {
    return owned.derivationKey === proposal.derivationKey
      ? { action: "skip", reason: "owner_controlled" }
      : { action: "flag_divergence", intentId: owned.id, proposal };
  }

  const open = existing.find((e) => e.status === "PROPOSED");
  if (open) {
    return open.derivationKey === proposal.derivationKey
      ? { action: "skip", reason: "proposal_current" }
      : { action: "revise", intentId: open.id, proposal };
  }

  if (!withinWindow(source, now)) return { action: "skip", reason: "outside_window" };
  return { action: "create", proposal };
}

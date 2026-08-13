// Commercial intent: what a party is willing to do, and why FarmaTrade
// believes it.
//
// As of the physical rename this is no longer a translation seam — the
// table, the enums and the domain all say the same words, so the mapping
// functions that used to live here are gone rather than left as identity
// wrappers. What remains is the vocabulary itself and the rules that go with
// it.
//
// The distinction that matters, and the reason this module exists:
//
//   Farm state    what physically exists — 26 tonnes in the shed
//   Intent        what is commercially available — up to 20 of them
//
// Those are different numbers about different things. A farmer holding back
// six tonnes for their own use has not "listed 20 of 26"; they have 26 and
// are offering 20. An intent *references* state; it is not the state.
// Creating, matching or withdrawing an intent never touches inventory —
// only fulfilment does.
//
// Pure and DB-free.

import type { Intent as IntentRow, IntentOrigin, IntentSide, IntentStatus } from "@/generated/prisma/client";
import { hasRemainingCapacity } from "@/lib/capacity";

export type { IntentOrigin, IntentSide, IntentStatus };

// The other side of the market. Named as a function rather than written
// inline at the one call site because "the opposite of supply is demand" is
// a domain fact, not a ternary.
export function oppositeSide(side: IntentSide): IntentSide {
  return side === "SUPPLY" ? "DEMAND" : "SUPPLY";
}

// What a farmer reads. Deliberately not "I have" / "I need" — that is the
// grammar of writing an advert. This is the grammar of a standing position:
// a party can hold 26 tonnes and be offering none of it.
export const SIDE_LABEL: Record<IntentSide, string> = {
  SUPPLY: "Offering",
  DEMAND: "Looking for",
};

export const STATUS_LABEL: Record<IntentStatus, string> = {
  PROPOSED: "Suggested by FarmaTrade",
  ACTIVE: "Available",
  ENGAGED: "In discussion",
  WITHDRAWN: "Closed",
};

export const ORIGIN_LABEL: Record<IntentOrigin, string> = {
  DERIVED: "From your farm records",
  DECLARED: "You added this",
};

// Whether an intent is authorized to take part in the market at all.
//
// PROPOSED is excluded because FarmaTrade derived it and its owner has not
// agreed to it — matching on one would be putting words in their mouth.
// WITHDRAWN is excluded because the owner said no. Both are questions about
// permission, and no amount of remaining quantity answers them.
export function isAuthorizedToMatch(intent: { status: IntentStatus }): boolean {
  return intent.status === "ACTIVE" || intent.status === "ENGAGED";
}

// Whether an intent is currently open to being matched.
//
// Two questions, and keeping them separate is the point: is this party
// authorized to trade at all, and is there anything left to trade. ENGAGED
// used to fail the first question, which was the old MATCHED behaviour
// carried forward under a new name — it treated "in discussion" as
// "finished". A farmer offering 20 tonnes who agreed 8 with one buyer still
// has 12 tonnes for sale, and taking the whole intent off the market was
// costing them the other 12.
//
// So ENGAGED is now authorized, and exhaustion is what removes an intent
// instead. Remaining is derived from live engagements rather than stored;
// see lib/capacity.ts.
//
//   ACTIVE,  remaining > 0    matchable
//   ACTIVE,  remaining = 0    not matchable — fully spoken for
//   ENGAGED, remaining > 0    matchable — partly available
//   ENGAGED, remaining = 0    not matchable
//   PROPOSED / WITHDRAWN      never matchable, whatever the quantity
//
// `remaining` of null means unbounded, not empty: an intent whose owner
// never stated a quantity has declared no ceiling to reach.
export function isMatchable(intent: {
  status: IntentStatus;
  remaining: number | null;
}): boolean {
  if (!isAuthorizedToMatch(intent)) return false;
  return hasRemainingCapacity(intent.remaining);
}

// The shape the domain passes around: a projection of the stored row, named
// and grouped for what each field means commercially.
export type Intent = {
  id: string;
  partyId: string;
  side: IntentSide;
  origin: IntentOrigin;
  status: IntentStatus;
  // What it is about, canonically. Null for services and for anything
  // predating the product catalogue.
  productId: string | null;
  // What the party calls it, exactly as they wrote it.
  label: string;
  // How much is commercially available under this intent — NOT how much
  // physically exists. See the note at the top of this file.
  quantity: number | null;
  unit: string | null;
  askingPrice: number | null;
  countryCode: string;
  province: string;
  district: string;
  neededBy: Date | null;
  expiresAt: Date | null;
  recurring: boolean;
  urgent: boolean;
  openToCrossBorder: boolean;
  createdAt: Date;
};

export function asIntent(row: IntentRow): Intent {
  return {
    id: row.id,
    partyId: row.partyId,
    side: row.side,
    origin: row.origin,
    status: row.status,
    productId: row.productId,
    label: row.title,
    quantity: row.quantity,
    unit: row.unit,
    askingPrice: row.askingPrice == null ? null : Number(row.askingPrice),
    countryCode: row.countryCode,
    province: row.province,
    district: row.district,
    neededBy: row.neededBy,
    expiresAt: row.expiresAt,
    recurring: row.recurring,
    urgent: row.urgent,
    openToCrossBorder: row.openToCrossBorder,
    createdAt: row.createdAt,
  };
}

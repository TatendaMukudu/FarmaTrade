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

// Whether an intent is currently open to being matched.
//
// PROPOSED is excluded because FarmaTrade derived it and its owner has not
// agreed to it — matching on one would be putting words in their mouth.
//
// ENGAGED is excluded *for now* and only because that is exactly what the
// old MATCHED status did; this is a rename, not a behaviour change. It is
// not because engagement is terminal. An intent under discussion may still
// be partly available, may carry several matches, and returns to ACTIVE when
// a negotiation falls through. When quantity semantics land, this predicate
// becomes a question about remaining availability rather than about status,
// and ENGAGED will stop being a blanket exclusion.
export function isMatchable(intent: { status: IntentStatus }): boolean {
  return intent.status === "ACTIVE";
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

// Commercial intent: what a party is willing to do, and why FarmaTrade
// believes it.
//
// This is the domain vocabulary. The physical table is still called `Post`
// and will be for one more checkpoint — renaming a table with live foreign
// keys from Match, Photo and Conversation is a separate, mechanical piece of
// work, and doing it in the same change as the conceptual one would make
// both unreviewable. Everything above persistence speaks Intent; the mapping
// to the old names lives here and nowhere else.
//
// The distinction that matters, and the reason this exists at all:
//
//   Farm state    what physically exists — 26 tonnes in the shed
//   Intent        what is commercially available — up to 20 of them
//
// Those are different numbers about different things. A farmer holding back
// six tonnes for their own use has not "listed 20 of 26"; they have 26 and
// are offering 20. Intent never decrements inventory, and creating one is
// not a reservation of anything.
//
// Pure and DB-free.

import type { Post, PostType } from "@/generated/prisma/client";

// Which way the value flows. Replaces HAVE/NEED as the word the domain
// uses — "have" and "need" describe a listing someone wrote, SUPPLY and
// DEMAND describe a position in a market.
export type IntentDirection = "SUPPLY" | "DEMAND";

// Why this intent exists.
//
// DERIVED is meant to become the normal path: FarmaTrade already knows the
// farm has 26 tonnes of maize with a harvest date, so it proposes the
// availability and the farmer confirms. DECLARED remains for everything with
// no underlying record — a buyer's requirement, a transporter's capacity, a
// need for something the farm does not have.
export type IntentOrigin = "DERIVED" | "DECLARED";

// How far along an intent is. Same values the storage enum has carried,
// named for what they mean commercially rather than for a publishing
// lifecycle.
export type IntentStatus = "PROPOSED" | "ACTIVE" | "ENGAGED" | "WITHDRAWN";

const DIRECTION_FROM_TYPE: Record<PostType, IntentDirection> = {
  HAVE: "SUPPLY",
  NEED: "DEMAND",
};

const TYPE_FROM_DIRECTION: Record<IntentDirection, PostType> = {
  SUPPLY: "HAVE",
  DEMAND: "NEED",
};

const STATUS_FROM_STORED: Record<string, IntentStatus> = {
  // Proposed by FarmaTrade, waiting on the farmer. Never matched against.
  DRAFT: "PROPOSED",
  ACTIVE: "ACTIVE",
  OPEN: "ACTIVE",
  // Being acted on by at least one match.
  MATCHED: "ENGAGED",
  CLOSED: "WITHDRAWN",
};

export function directionOf(type: PostType): IntentDirection {
  return DIRECTION_FROM_TYPE[type];
}

export function typeForDirection(direction: IntentDirection): PostType {
  return TYPE_FROM_DIRECTION[direction];
}

export function statusOf(stored: string): IntentStatus {
  return STATUS_FROM_STORED[stored] ?? "ACTIVE";
}

// What a farmer reads. Deliberately not "I have" / "I need" — that is the
// grammar of writing an advert. This is the grammar of a standing position.
export const DIRECTION_LABEL: Record<IntentDirection, string> = {
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

// The shape the domain passes around. A projection of the stored row, not a
// new table — every field here already exists, it is only named and grouped
// for what it means.
export type Intent = {
  id: string;
  partyId: string;
  direction: IntentDirection;
  origin: IntentOrigin;
  status: IntentStatus;
  // What it is about, canonically. Null for services and for anything
  // predating the product catalogue.
  productId: string | null;
  // What the party calls it.
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

// Reads a stored row as an Intent. The single translation point between the
// persistence name and the domain name — when the table is finally renamed,
// this function changes and nothing above it does.
export function asIntent(row: Post): Intent {
  return {
    id: row.id,
    partyId: row.partyId,
    direction: directionOf(row.type),
    origin: (row.origin ?? "DECLARED") as IntentOrigin,
    status: statusOf(row.status),
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

// Whether an intent is currently open to being matched. PROPOSED is
// deliberately excluded: FarmaTrade suggested it, the farmer has not yet
// agreed, and matching something nobody has confirmed would be putting
// words in their mouth.
export function isMatchable(intent: Pick<Intent, "status">): boolean {
  return intent.status === "ACTIVE";
}

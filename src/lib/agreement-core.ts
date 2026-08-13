// Bilateral agreement: what it takes for an engagement to reserve anybody's
// capacity.
//
// The invariant this module exists to make provable:
//
//   No party's commercial capacity may be consumed except by an agreement
//   that BOTH parties accepted, each against the SAME identified version of
//   the same terms.
//
// It used to be possible for one party to move a match to ACCEPTED alone,
// and after quantity semantics landed that meant a buyer could reserve a
// farmer's tonnage without the farmer ever answering — take twenty tonnes
// off the market on a stranger's say-so. The status said "accepted" and
// nothing recorded who had accepted, so there was nothing to check.
//
// The fix is not a stricter status. It is that consent stops being a status
// at all and becomes rows: one per party, per terms version. "Both agreed"
// is then something the data can be asked, rather than something a status
// asserts on the strength of whoever wrote it last.
//
// Pure and DB-free.

import type { MatchStatus } from "@/generated/prisma/client";

// One immutable version of the commercial terms of an engagement.
export type TermsVersion = {
  id: string;
  version: number;
  quantity: number | null;
  // What was typed, for showing the parties their own words back.
  unit: string | null;
  // Canonical unit identity, fixed when the version was proposed. What the
  // parties agreed cannot change because an alias table changed later — see
  // measurement.ts. Null where the term could not be resolved, which makes
  // the agreement real but its quantity uncountable.
  unitCode: string | null;
  price: number | null;
  handoverOn: Date | null;
  proposedById: string;
  // Party ids that have accepted THIS version. Never inherited from an
  // earlier one — that inheritance is exactly the bug.
  acceptedBy: string[];
};

// The two parties to an engagement. Party ids rather than buyer/seller,
// because a match pairs two intents and a transport pairing has no buyer.
export type Participants = readonly [string, string];

export function isAcceptedByBoth(terms: TermsVersion, participants: Participants): boolean {
  return participants.every((partyId) => terms.acceptedBy.includes(partyId));
}

// Who still has to say yes to these terms.
export function awaitingFrom(terms: TermsVersion, participants: Participants): string[] {
  return participants.filter((partyId) => !terms.acceptedBy.includes(partyId));
}

// The terms currently in force: the highest version both parties accepted.
//
// Highest rather than latest-created, and both-accepted rather than
// latest-anything. Proposing new terms does not disturb the agreement
// already in force — version 2 governs nothing until version 2 has two
// acceptances of its own. That is what lets a renegotiation fail without
// destroying the deal it was trying to replace.
export function governingTerms(
  versions: readonly TermsVersion[],
  participants: Participants,
): TermsVersion | null {
  const agreed = versions.filter((t) => isAcceptedByBoth(t, participants));
  if (agreed.length === 0) return null;
  return agreed.reduce((latest, t) => (t.version > latest.version ? t : latest));
}

// Terms on the table that are not yet agreed by both — what someone is
// waiting on. Null when the latest version is already the governing one.
export function openTerms(
  versions: readonly TermsVersion[],
  participants: Participants,
): TermsVersion | null {
  if (versions.length === 0) return null;
  const latest = versions.reduce((a, b) => (b.version > a.version ? b : a));
  return isAcceptedByBoth(latest, participants) ? null : latest;
}

export function nextVersion(versions: readonly TermsVersion[]): number {
  return versions.reduce((max, t) => Math.max(max, t.version), 0) + 1;
}

// Whether two sets of terms are the same commercial deal.
//
// Every field is material. There is no such thing as a cosmetic change to a
// price or a handover date, and treating one as cosmetic would be exactly
// the silent carrying-forward of consent this module exists to prevent. If
// a term is not worth re-confirming, it does not belong in the terms.
export function materiallyDiffers(
  a: Pick<TermsVersion, "quantity" | "unit" | "unitCode" | "price" | "handoverOn">,
  b: Pick<TermsVersion, "quantity" | "unit" | "unitCode" | "price" | "handoverOn">,
): boolean {
  return (
    a.quantity !== b.quantity ||
    // Both the canonical identity and the typed words. The identity is what
    // the deal means; the words are what the parties read, and re-proposing
    // "10 t" over "10 tonnes" is not worth blanking consent over — but a
    // change from tonnes to bags plainly is, and that shows up in both.
    (a.unitCode ?? null) !== (b.unitCode ?? null) ||
    (a.unit ?? null) !== (b.unit ?? null) ||
    a.price !== b.price ||
    (a.handoverOn?.getTime() ?? null) !== (b.handoverOn?.getTime() ?? null)
  );
}

// What an engagement reserves, if anything.
//
// THE authoritative predicate. Ranking, routes, pages and the capacity sum
// all ask this one function rather than testing statuses or counting
// acceptances themselves — a check like `aAccepted && bAccepted` written at
// a call site is a copy of this rule that can drift out of step with it.
export type Reservation = {
  reserves: boolean;
  quantity: number | null;
  unit: string | null;
  // Canonical identity of `quantity`. Capacity converts through this and
  // never through the display string.
  unitCode: string | null;
  // Why, in a word — for tests and for explaining a capacity figure to
  // somebody who does not believe it.
  basis: "mutual_agreement" | "legacy_completed" | "none";
};

export function reservationFor(engagement: {
  status: MatchStatus;
  // Someone reported the trade never happened. One side saying so is
  // enough, as everywhere else in the app.
  fellThrough?: boolean;
  governing: TermsVersion | null;
  // Match.quantity/unit, read for exactly one case. See below.
  legacyQuantity?: number | null;
  legacyUnit?: string | null;
  legacyUnitCode?: string | null;
}): Reservation {
  const none: Reservation = {
    reserves: false,
    quantity: null,
    unit: null,
    unitCode: null,
    basis: "none",
  };

  // A trade that fell through consumed nothing, whatever anybody agreed
  // beforehand. Leaving it holding capacity would strand a farmer's supply
  // behind a deal that never occurred.
  if (engagement.fellThrough) return none;

  // Cancelled, declined, still being discussed, or never answered — none of
  // these is a bilateral agreement, and none of them reserves.
  //
  // NEGOTIATING covers the case that used to be the bug: one party has
  // accepted and is waiting for the other. Their own willingness is real
  // and recorded, and it takes nothing from anyone.
  if (engagement.status === "AGREED" || engagement.status === "COMPLETED") {
    if (engagement.governing) {
      return {
        reserves: true,
        quantity: engagement.governing.quantity,
        unit: engagement.governing.unit,
        unitCode: engagement.governing.unitCode,
        basis: "mutual_agreement",
      };
    }

    // A COMPLETED match with no terms rows predates bilateral agreement.
    // Two confirmations exist on it — both parties filed a report — which
    // is genuine evidence that both acted, so its quantity is grandfathered
    // rather than dropped. This is reading the record, not inventing one.
    if (engagement.status === "COMPLETED") {
      return {
        reserves: true,
        quantity: engagement.legacyQuantity ?? null,
        unit: engagement.legacyUnit ?? null,
        // Legacy rows predate canonical identity, so the code is resolved
        // from the stored text at read time. Deterministic where the term
        // is a known alias and null otherwise, which is the same answer the
        // backfill reached — nothing is invented for a row that never had a
        // canonical unit.
        unitCode: engagement.legacyUnitCode ?? null,
        basis: "legacy_completed",
      };
    }
  }

  // Legacy ACCEPTED falls through to here deliberately. One party moved it
  // there alone and nothing records who, so there is no consent to honour.
  // It reserves nothing until both parties agree properly.
  return none;
}

// What the engagement's state should be, given who has agreed to what.
//
// Derived rather than assigned, so the status can never claim an agreement
// the acceptance rows do not support. The one thing it will not do is
// overrule a decision a person made: DECLINED and COMPLETED are outcomes
// somebody reported, and no amount of terms activity moves an engagement
// back out of them.
export function statusFor(
  current: MatchStatus,
  versions: readonly TermsVersion[],
  participants: Participants,
): MatchStatus {
  if (current === "DECLINED" || current === "COMPLETED") return current;
  if (governingTerms(versions, participants)) return "AGREED";
  if (versions.length > 0) return "NEGOTIATING";
  // Nothing proposed yet. A legacy ACCEPTED row stays where it is until
  // somebody proposes real terms on it, so it remains identifiable.
  return current === "ACCEPTED" ? "ACCEPTED" : "SUGGESTED";
}

// How an engagement reads to one of its two parties.
//
// Coordination between people, not a checkout funnel: the states a farmer
// cares about are whose move it is and whether anything is settled.
export type EngagementView =
  | "suggested"
  | "waiting_for_you"
  | "waiting_for_them"
  | "agreed"
  | "renegotiating"
  | "completed"
  | "closed";

export function viewFor(
  engagement: { status: MatchStatus; versions: readonly TermsVersion[] },
  participants: Participants,
  viewerId: string,
): EngagementView {
  if (engagement.status === "COMPLETED") return "completed";
  if (engagement.status === "DECLINED") return "closed";

  const open = openTerms(engagement.versions, participants);
  const governing = governingTerms(engagement.versions, participants);

  if (open) {
    // Terms are on the table that somebody has not answered. If an
    // agreement is already in force, this is a renegotiation of it rather
    // than a first offer, and saying so matters — the farmer has a live
    // deal either way.
    if (governing) return "renegotiating";
    return awaitingFrom(open, participants).includes(viewerId)
      ? "waiting_for_you"
      : "waiting_for_them";
  }

  if (governing) return "agreed";
  return "suggested";
}

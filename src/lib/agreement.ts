import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  governingTerms,
  isAcceptedByBoth,
  materiallyDiffers,
  nextVersion,
  reservationFor,
  statusFor,
  type Participants,
  type TermsVersion,
} from "@/lib/agreement-core";
import { fitsWithin, pairwiseQuantity, readCapacity, type Allocation } from "@/lib/capacity";
import { resolveUnit, type CanonicalUnit } from "@/lib/measurement";
import type { PriceBasis } from "@/generated/prisma/client";
import { isAuthorizedToMatch } from "@/lib/intent";

// The authoritative write path for commercial agreement.
//
// Two operations, and between them they are the only way capacity is ever
// reserved: propose terms, and accept terms. Both run inside the same
// locked transaction P0.3 established, because the moment an agreement
// becomes bilateral is the moment capacity is taken, and checking whether
// it fits has to happen where nothing can have changed underneath.
//
// Inventory is never touched here, by either operation. Agreeing to supply
// eight tonnes records that eight of the twenty a farmer authorized are
// spoken for; it does not move eight tonnes.

export type TermsInput = {
  quantity?: number | null;
  unit?: string | null;
  price?: number | null;
  // What the price means. A caller that supplies an amount without these is
  // proposing a number nobody can total, and the stored row says so rather
  // than pretending otherwise.
  priceCurrency?: string | null;
  priceBasis?: PriceBasis | null;
  priceUnit?: string | null;
  handoverOn?: Date | null;
};

export type AgreementOutcome =
  | { ok: true; status: "proposed" | "agreed" | "already_agreed"; version: number }
  | {
      ok: false;
      reason:
        | "not_found"
        | "not_a_participant"
        | "not_authorized"
        | "insufficient_capacity"
        | "closed";
    };

// Loads a match with everything the agreement rules need to decide.
async function loadEngagement(client: Prisma.TransactionClient, matchId: string) {
  const match = await client.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      status: true,
      quantity: true,
      unit: true,
      intentA: {
        select: {
          id: true, partyId: true, side: true, status: true,
          quantity: true, unit: true, unitCode: true,
        },
      },
      intentB: {
        select: {
          id: true, partyId: true, side: true, status: true,
          quantity: true, unit: true, unitCode: true,
        },
      },
      confirmations: { select: { outcome: true } },
      terms: {
        select: {
          id: true,
          version: true,
          quantity: true,
          unit: true,
          unitCode: true,
          price: true,
          priceCurrency: true,
          priceBasis: true,
          priceUnitCode: true,
          handoverOn: true,
          proposedById: true,
          acceptances: { select: { partyId: true } },
        },
      },
    },
  });
  if (!match) return null;

  const versions: TermsVersion[] = match.terms.map((t) => ({
    id: t.id,
    version: t.version,
    quantity: t.quantity,
    unit: t.unit,
    unitCode: t.unitCode,
    price: t.price == null ? null : Number(t.price),
    priceCurrency: t.priceCurrency,
    priceBasis: t.priceBasis,
    priceUnitCode: t.priceUnitCode,
    handoverOn: t.handoverOn,
    proposedById: t.proposedById,
    acceptedBy: t.acceptances.map((a) => a.partyId),
  }));

  const participants: Participants = [match.intentA.partyId, match.intentB.partyId];
  return { match, versions, participants };
}

// A canonical unit code for a free-text unit, or null.
//
// Used only for legacy Match rows, which predate the canonical column.
// Deterministic where the term is a known alias and null otherwise —
// exactly the answer the backfill migration reached, so a legacy row means
// the same thing whether it is read here or was rewritten there.
function legacyCode(unit: string | null): string | null {
  const resolved = resolveUnit(unit);
  return resolved.ok ? resolved.unit.code : null;
}

// Same primitive as P0.3, and deliberately the only one. A second
// concurrency model would be a second set of rules about what is safe, and
// two such sets are how oversubscription gets back in.
async function lockIntents(tx: Prisma.TransactionClient, intentIds: string[]): Promise<void> {
  const ordered = [...new Set(intentIds)].sort();
  await tx.$queryRaw`SELECT id FROM "Intent" WHERE id IN (${Prisma.join(ordered)}) ORDER BY id FOR UPDATE`;
}

// Every reservation held against these intents, resolved through the one
// authoritative predicate.
//
// `exceptMatchId` leaves one engagement out. That is what makes a
// renegotiation validate honestly: a match already holding 6 of 10 tonnes
// must weigh its own 6 as its own, or replacing them with 8 would be
// checked against 4 remaining and fail for no reason.
async function reservationsByIntent(
  client: Prisma.TransactionClient,
  intentIds: string[],
  exceptMatchId?: string,
): Promise<Map<string, Allocation[]>> {
  const matches = await client.match.findMany({
    where: {
      OR: [{ intentAId: { in: intentIds } }, { intentBId: { in: intentIds } }],
      ...(exceptMatchId ? { id: { not: exceptMatchId } } : {}),
    },
    select: {
      intentAId: true,
      intentBId: true,
      status: true,
      quantity: true,
      unit: true,
      confirmations: { select: { outcome: true } },
      terms: {
        select: {
          id: true,
          version: true,
          quantity: true,
          unit: true,
          unitCode: true,
          price: true,
          priceCurrency: true,
          priceBasis: true,
          priceUnitCode: true,
          handoverOn: true,
          proposedById: true,
          acceptances: { select: { partyId: true } },
        },
      },
      intentA: { select: { partyId: true } },
      intentB: { select: { partyId: true } },
    },
  });

  const byIntent = new Map<string, Allocation[]>(intentIds.map((id) => [id, []]));
  for (const m of matches) {
    const versions: TermsVersion[] = m.terms.map((t) => ({
      id: t.id,
      version: t.version,
      quantity: t.quantity,
      unit: t.unit,
      unitCode: t.unitCode,
      price: t.price == null ? null : Number(t.price),
      priceCurrency: t.priceCurrency,
      priceBasis: t.priceBasis,
      priceUnitCode: t.priceUnitCode,
      handoverOn: t.handoverOn,
      proposedById: t.proposedById,
      acceptedBy: t.acceptances.map((a) => a.partyId),
    }));
    const participants: Participants = [m.intentA.partyId, m.intentB.partyId];

    const reservation = reservationFor({
      status: m.status,
      fellThrough: m.confirmations.some((c) => c.outcome === "DID_NOT_HAPPEN"),
      governing: governingTerms(versions, participants),
      legacyQuantity: m.quantity,
      legacyUnit: m.unit,
      // Legacy Match rows never had a canonical column. Resolved from the
      // stored text at read time, deterministically or not at all.
      legacyUnitCode: legacyCode(m.unit),
    });

    for (const id of [m.intentAId, m.intentBId]) {
      byIntent.get(id)?.push(reservation);
    }
  }
  return byIntent;
}

export { reservationsByIntent };

// Put commercial terms on the table.
//
// Proposing is itself an acceptance — nobody offers a deal they would not
// do — so the proposer's consent is written alongside the version. The
// counterparty's is not, and cannot be inferred: a new version starts with
// exactly one acceptance however many the previous one had.
//
// Proposing does not reserve anything. An engagement waiting on a reply
// takes nothing off anybody's market, which is the correction this whole
// phase exists for.
export async function proposeTerms(
  matchId: string,
  partyId: string,
  input: TermsInput,
): Promise<AgreementOutcome> {
  return prisma.$transaction(async (tx) => {
    const loaded = await loadEngagement(tx, matchId);
    if (!loaded) return { ok: false, reason: "not_found" };
    const { match: initiallyLoaded, participants: initialParticipants } = loaded;

    if (!initialParticipants.includes(partyId)) return { ok: false, reason: "not_a_participant" };

    await lockIntents(tx, [initiallyLoaded.intentA.id, initiallyLoaded.intentB.id]);
    // The initial read only identifies the rows to lock. Decisions use a
    // fresh read after the lock, otherwise a close/withdraw/proposal that
    // committed while this transaction waited could be silently overwritten.
    const current = await loadEngagement(tx, matchId);
    if (!current) return { ok: false, reason: "not_found" };
    const { match, versions, participants } = current;

    if (match.status === "DECLINED" || match.status === "COMPLETED") {
      return { ok: false, reason: "closed" };
    }

    const intents = [match.intentA, match.intentB];
    if (intents.some((i) => !isAuthorizedToMatch(i))) {
      return { ok: false, reason: "not_authorized" };
    }

    // Proposing the deal that is already in force is not a renegotiation,
    // and should not blank the counterparty's consent to it.
    const governing = governingTerms(versions, participants);
    // Canonical identity is fixed here, at proposal time, and stored beside
    // the words. What the parties agree to is a physical quantity, not a
    // string that a later alias change could re-point.
    const resolved = resolveUnit(input.unit);
    // The unit a rate is quoted per, resolved through the same canonical
    // table as the quantity. A rate per a unit FarmaTrade cannot resolve is
    // stored with a null code, which makes it unvaluable rather than
    // silently wrong.
    const priceUnit = resolveUnit(input.priceUnit);
    const terms = {
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      unitCode: resolved.ok ? resolved.unit.code : null,
      price: input.price ?? null,
      priceCurrency: input.priceCurrency ?? null,
      priceBasis: input.priceBasis ?? null,
      priceUnitCode: priceUnit.ok ? priceUnit.unit.code : null,
      handoverOn: input.handoverOn ?? null,
    };
    if (governing && !materiallyDiffers(governing, terms)) {
      return { ok: true, status: "already_agreed", version: governing.version };
    }

    const version = nextVersion(versions);
    const created = await tx.agreementTerms.create({
      data: {
        matchId,
        version,
        quantity: terms.quantity,
        unit: terms.unit,
        unitCode: terms.unitCode,
        price: terms.price,
        priceCurrency: terms.priceCurrency,
        priceBasis: terms.priceBasis,
        priceUnitCode: terms.priceUnitCode,
        handoverOn: terms.handoverOn,
        proposedById: partyId,
      },
    });
    await tx.termsAcceptance.create({ data: { termsId: created.id, partyId } });

    // The status is re-derived rather than set, so it can never claim an
    // agreement the acceptance rows do not support. A live agreement stays
    // AGREED while its replacement is only proposed.
    await tx.match.update({
      where: { id: matchId },
      data: {
        status: statusFor(
          match.status,
          [
            ...versions,
            { ...created, price: terms.price, acceptedBy: [partyId] } as TermsVersion,
          ],
          participants,
        ),
      },
    });

    return { ok: true, status: "proposed", version };
  });
}

// Agree to terms somebody put on the table.
//
// This is where capacity is reserved, and only here — the moment the second
// acceptance lands and the agreement becomes bilateral. The check that it
// fits happens in this same transaction, behind the same lock, against a
// read no concurrent agreement can have gone stale behind.
//
// If it does not fit, the acceptance is refused outright rather than
// recorded-but-ineffective. That keeps "both parties accepted" and "the
// engagement is agreed" the same statement, which is what makes the
// invariant checkable from the data instead of only from the code.
export async function acceptTerms(
  matchId: string,
  partyId: string,
  version?: number,
): Promise<AgreementOutcome> {
  return prisma.$transaction(async (tx) => {
    const loaded = await loadEngagement(tx, matchId);
    if (!loaded) return { ok: false, reason: "not_found" };
    const { match: initiallyLoaded, participants: initialParticipants } = loaded;

    if (!initialParticipants.includes(partyId)) return { ok: false, reason: "not_a_participant" };

    await lockIntents(tx, [initiallyLoaded.intentA.id, initiallyLoaded.intentB.id]);
    const current = await loadEngagement(tx, matchId);
    if (!current) return { ok: false, reason: "not_found" };
    const { match, versions, participants } = current;

    if (match.status === "DECLINED" || match.status === "COMPLETED") {
      return { ok: false, reason: "closed" };
    }
    if (versions.length === 0) return { ok: false, reason: "not_found" };

    // Accepting names the version on purpose. Without it, a party clicking
    // "agree" on terms they were shown could land on terms proposed a
    // second earlier — agreeing to a deal they never saw.
    const target =
      version == null
        ? versions.reduce((a, b) => (b.version > a.version ? b : a))
        : versions.find((t) => t.version === version);
    if (!target) return { ok: false, reason: "not_found" };

    const intents = [match.intentA, match.intentB];
    if (intents.some((i) => !isAuthorizedToMatch(i))) {
      return { ok: false, reason: "not_authorized" };
    }

    if (isAcceptedByBoth(target, participants)) {
      return { ok: true, status: "already_agreed", version: target.version };
    }

    const wouldBeAgreed = isAcceptedByBoth(
      { ...target, acceptedBy: [...new Set([...target.acceptedBy, partyId])] },
      participants,
    );

    // The second acceptance is the one that costs something, so it is the
    // one that has to fit. Validated with this match's own current
    // reservation excluded — a renegotiation from 6 tonnes to 8 is checked
    // against the 6 it already holds being released, not on top of them.
    if (wouldBeAgreed && target.quantity != null) {
      const intentIds = [match.intentA.id, match.intentB.id];
      const others = await reservationsByIntent(tx, intentIds, matchId);
      // Checked in canonical units, so agreeing 8000 kg against an intent
      // authorized in tonnes is weighed correctly rather than compared as
      // two bare numbers. Where the agreement cannot be measured against
      // the intent at all — bags against tonnes — fitsWithin reports that
      // it fits, because it reserves nothing measurable and there is no
      // quantity question to answer. It shows up in the diagnostics
      // instead of being silently converted.
      const fits = intents.every(
        (intent) =>
          fitsWithin(
            readCapacity(intent, others.get(intent.id) ?? []),
            target.quantity,
            target.unitCode,
          ).fits,
      );
      if (!fits) return { ok: false, reason: "insufficient_capacity" };
    }

    await tx.termsAcceptance.create({ data: { termsId: target.id, partyId } });

    const updated = versions.map((t) =>
      t.id === target.id ? { ...t, acceptedBy: [...t.acceptedBy, partyId] } : t,
    );
    await tx.match.update({
      where: { id: matchId },
      data: {
        status: statusFor(match.status, updated, participants),
        // Kept in step for display and for the legacy read path, written in
        // the same transaction as the consent that justifies it. Capacity
        // never reads it for a match that has terms.
        ...(wouldBeAgreed ? { quantity: target.quantity, unit: target.unit } : {}),
      },
    });

    await syncEngagement(tx, [match.intentA.id, match.intentB.id]);

    return {
      ok: true,
      status: wouldBeAgreed ? "agreed" : "proposed",
      version: target.version,
    };
  });
}

// The terms FarmaTrade would suggest for an engagement nobody has put a
// number to: as much as both sides can still do, at the asking price if one
// side named one.
//
// A starting point for a conversation, not a decision made on anyone's
// behalf — it is still proposed by a party and still needs the other to
// agree.
// A side's asking price, as far as it is known to mean anything.
export type PricedSide = {
  remaining: number | null;
  basis: CanonicalUnit | null;
  askingPrice: number | null;
  priceCurrency: string | null;
  priceBasis: PriceBasis | null;
  priceUnitCode: string | null;
};

export function suggestedTerms(supply: PricedSide, demand: PricedSide): TermsInput {
  const pairwise = pairwiseQuantity(supply, demand);

  // Whichever side actually quoted a price whose meaning is recorded. A
  // legacy amount with no basis is not carried forward: putting it on a new
  // terms version would launder an ambiguous number into one two parties
  // are about to agree on, which is precisely how the ambiguity spread in
  // the first place.
  const priced = [supply, demand].find((s) => s.askingPrice != null && s.priceBasis != null);

  return {
    quantity: pairwise?.value ?? null,
    // The canonical unit's own word, so what gets proposed says "500 kg"
    // rather than echoing a string neither side typed.
    unit: pairwise?.unit?.one ?? null,
    // Carried across with its meaning intact and its number untouched. A
    // rate is never rescaled to match the proposed quantity's unit — the
    // parties quoted per tonne, and the valuation converts at read time
    // rather than rewriting what was quoted.
    price: priced?.askingPrice ?? null,
    priceCurrency: priced?.priceCurrency ?? null,
    priceBasis: priced?.priceBasis ?? null,
    priceUnit: priced?.priceUnitCode ?? null,
    handoverOn: null,
  };
}

// Keeps ENGAGED meaning what it says on the two intents.
//
// Derived from what actually reserves capacity, so an intent is only "in
// discussion" while a bilateral agreement holds something of it. PROPOSED
// and WITHDRAWN are never touched — those are statements about permission
// that market activity is not entitled to overrule, which is the P0.2C
// ownership rule holding underneath all of this.
async function syncEngagement(tx: Prisma.TransactionClient, intentIds: string[]): Promise<void> {
  const reservations = await reservationsByIntent(tx, intentIds);
  for (const intentId of intentIds) {
    const engaged = (reservations.get(intentId) ?? []).some((r) => r.reserves);
    await tx.intent.updateMany({
      where: { id: intentId, status: engaged ? "ACTIVE" : "ENGAGED" },
      data: { status: engaged ? "ENGAGED" : "ACTIVE" },
    });
  }
}

export { syncEngagement };

// Bring both sides of an engagement back into line with what it now
// reserves.
//
// Needed after a confirmation, because filing one can change that: a trade
// reported as never having happened stops reserving, and if it was the only
// thing holding either intent, that intent is available again rather than
// still "in discussion".
export async function syncEngagementForMatch(matchId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({
      where: { id: matchId },
      select: { intentAId: true, intentBId: true },
    });
    if (!match) return;
    const intentIds = [match.intentAId, match.intentBId];
    await lockIntents(tx, intentIds);
    await syncEngagement(tx, intentIds);
  });
}

// Close an engagement — declined before agreement, or cancelled after it.
//
// One operation for both because the capacity effect is identical and
// deriving it from the row's own history keeps it that way: a DECLINED
// engagement stops satisfying the reservation predicate, so whatever it
// held simply stops appearing in the sum. Nothing has to remember to give
// it back, and nothing physical moves in either direction.
//
// The terms history survives. What was agreed before a cancellation is part
// of the record of what happened, and deleting it would leave two parties
// disagreeing about a deal with nothing to point at.
export async function closeEngagement(matchId: string, partyId: string): Promise<AgreementOutcome> {
  return prisma.$transaction(async (tx) => {
    const loaded = await loadEngagement(tx, matchId);
    if (!loaded) return { ok: false, reason: "not_found" };
    const { match: initiallyLoaded, participants: initialParticipants } = loaded;
    if (!initialParticipants.includes(partyId)) return { ok: false, reason: "not_a_participant" };

    const intentIds = [initiallyLoaded.intentA.id, initiallyLoaded.intentB.id];
    await lockIntents(tx, intentIds);
    const current = await loadEngagement(tx, matchId);
    if (!current) return { ok: false, reason: "not_found" };
    if (current.match.status === "COMPLETED" || current.match.status === "DECLINED") {
      return { ok: false, reason: "closed" };
    }
    await tx.match.update({ where: { id: matchId }, data: { status: "DECLINED" } });
    await syncEngagement(tx, intentIds);

    return { ok: true, status: "proposed", version: 0 };
  });
}

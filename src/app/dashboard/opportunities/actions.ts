"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentParty } from "@/lib/auth";
import { confirmationSchema } from "@/lib/validation";
import { recomputeReputation } from "@/lib/reputation";
import { recomputeRelation } from "@/lib/relations";
import { loadCapacities } from "@/lib/allocation";
import { acceptTerms, closeEngagement, proposeTerms, suggestedTerms, syncEngagementForMatch } from "@/lib/agreement";
import { logger } from "@/lib/logger";
import { Prisma, type ConfirmationOutcome } from "@/generated/prisma/client";

export type ConfirmActionState = { error?: string };

export async function respondToMatch(formData: FormData) {
  const party = await getCurrentParty();
  if (!party) return;

  const id = String(formData.get("id"));
  const decision = String(formData.get("decision"));
  if (decision !== "ACCEPTED" && decision !== "DECLINED") return;

  const match = await prisma.match.findUnique({
    where: { id },
    select: {
      intentA: { select: { id: true, partyId: true, side: true, unit: true, askingPrice: true } },
      intentB: { select: { id: true, partyId: true, side: true, unit: true, askingPrice: true } },
    },
  });
  if (!match) return;

  const ownsMatch =
    match.intentA.partyId === party.id || match.intentB.partyId === party.id;
  if (!ownsMatch) return;

  if (decision === "DECLINED") {
    await closeEngagement(id, party.id);
    revalidatePath("/dashboard/opportunities");
    revalidatePath("/dashboard/intent");
    return;
  }

  // "Accept" no longer reserves anything by itself, and that is the whole
  // correction. One party saying yes is one party saying yes: it records
  // their consent to specific terms and waits for the other side. Capacity
  // moves when the second acceptance lands, inside the transaction that
  // checks it still fits.
  //
  // With terms already on the table, this agrees to the version the party
  // was shown. With none, it puts the obvious ones there — as much as both
  // sides can still do, at whatever asking price was named — as an opening
  // position the counterparty must still answer.
  const version = formData.get("version");
  const existing = await prisma.agreementTerms.count({ where: { matchId: id } });

  if (existing > 0) {
    await acceptTerms(id, party.id, version ? Number(version) : undefined);
  } else {
    const sides = await loadCapacities([match.intentA.id, match.intentB.id]);
    const supply = match.intentA.side === "SUPPLY" ? match.intentA : match.intentB;
    const demand = match.intentA.side === "SUPPLY" ? match.intentB : match.intentA;
    await proposeTerms(
      id,
      party.id,
      suggestedTerms(
        {
          remaining: sides.get(supply.id)?.remaining ?? null,
          unit: supply.unit,
          askingPrice: supply.askingPrice == null ? null : Number(supply.askingPrice),
        },
        {
          remaining: sides.get(demand.id)?.remaining ?? null,
          unit: demand.unit,
          askingPrice: demand.askingPrice == null ? null : Number(demand.askingPrice),
        },
      ),
    );
  }

  revalidatePath("/dashboard/opportunities");
  revalidatePath("/dashboard/intent");
}

// Put different terms on the table — the renegotiation path.
//
// Creates a new version rather than editing the current one, so consent to
// the old terms cannot silently carry forward onto the new ones. Any
// agreement already in force keeps governing until this version is agreed
// by both sides too.
export async function proposeMatchTerms(formData: FormData) {
  const party = await getCurrentParty();
  if (!party) return;

  const id = String(formData.get("matchId"));
  const quantity = Number(formData.get("quantity"));
  const price = Number(formData.get("price"));

  await proposeTerms(id, party.id, {
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
    unit: (formData.get("unit") as string) || null,
    price: Number.isFinite(price) && price > 0 ? price : null,
  });

  revalidatePath("/dashboard/opportunities");
  revalidatePath(`/dashboard/conversations/${id}`);
  revalidatePath("/dashboard/intent");
}

export async function confirmMatch(
  _prevState: ConfirmActionState,
  formData: FormData,
): Promise<ConfirmActionState> {
  const party = await getCurrentParty();
  if (!party) return { error: "Not signed in" };

  const parsed = confirmationSchema.safeParse({
    matchId: formData.get("matchId"),
    outcome: formData.get("outcome"),
    score: formData.get("score") || undefined,
    comment: formData.get("comment") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { matchId, outcome, score, comment } = parsed.data;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      status: true,
      intentA: { select: { partyId: true } },
      intentB: { select: { partyId: true } },
    },
  });
  // AGREED is the state a trade can be reported on. Legacy ACCEPTED rows
  // are allowed too: they reserve nothing, but two parties may genuinely
  // have traded on one before agreement became bilateral.
  if (!match || (match.status !== "AGREED" && match.status !== "ACCEPTED")) {
    return { error: "This match isn't in a confirmable state" };
  }

  const counterpartyId =
    match.intentA.partyId === party.id ? match.intentB.partyId : match.intentA.partyId;
  if (match.intentA.partyId !== party.id && match.intentB.partyId !== party.id) {
    return { error: "Not part of this match" };
  }

  // Append-only: a confirmation, once logged, is evidence — never silently
  // overwritten by a resubmission. The UI already hides the form after a
  // first submission; this is what actually enforces it, since a server
  // action is a POST endpoint anyone can hit directly.
  try {
    await prisma.transactionConfirmation.create({
      data: {
        matchId,
        partyId: party.id,
        outcome: outcome as ConfirmationOutcome,
        notes: comment,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "You've already logged this transaction" };
    }
    logger.error("confirmMatch.transaction_confirmation_failed", {
      matchId,
      partyId: party.id,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  if (score) {
    try {
      await prisma.rating.create({
        data: { matchId, authorId: party.id, subjectId: counterpartyId, score, comment },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) {
        logger.error("confirmMatch.rating_failed", {
          matchId,
          partyId: party.id,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    }
  }

  const confirmationCount = await prisma.transactionConfirmation.count({
    where: { matchId },
  });
  let justCompleted = false;
  if (confirmationCount >= 2) {
    const updated = await prisma.match.updateMany({
      where: { id: matchId, status: { not: "COMPLETED" } },
      data: { status: "COMPLETED" },
    });
    justCompleted = updated.count > 0;
  }

  // Filing a report can change what this engagement holds — "it did not
  // happen" releases the capacity it was speaking for — so both intents are
  // re-derived from their engagements rather than left describing a trade
  // that turned out not to exist.
  await syncEngagementForMatch(matchId);

  await Promise.all([
    recomputeReputation(party.id),
    recomputeReputation(counterpartyId),
    ...(justCompleted ? [recomputeRelation(party.id, counterpartyId)] : []),
  ]);

  revalidatePath("/dashboard/opportunities");
  revalidatePath("/dashboard/directory");
  return {};
}

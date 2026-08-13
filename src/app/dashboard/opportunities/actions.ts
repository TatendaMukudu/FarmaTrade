"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentParty } from "@/lib/auth";
import { confirmationSchema } from "@/lib/validation";
import { recomputeReputation } from "@/lib/reputation";
import { recomputeRelation } from "@/lib/relations";
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
    select: { intentA: { select: { partyId: true } }, intentB: { select: { partyId: true } } },
  });
  if (!match) return;

  const ownsMatch =
    match.intentA.partyId === party.id || match.intentB.partyId === party.id;
  if (!ownsMatch) return;

  await prisma.match.update({
    where: { id },
    data: { status: decision },
  });

  revalidatePath("/dashboard/opportunities");
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
  if (!match || match.status !== "ACCEPTED") {
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

  await Promise.all([
    recomputeReputation(party.id),
    recomputeReputation(counterpartyId),
    ...(justCompleted ? [recomputeRelation(party.id, counterpartyId)] : []),
  ]);

  revalidatePath("/dashboard/opportunities");
  revalidatePath("/dashboard/directory");
  return {};
}

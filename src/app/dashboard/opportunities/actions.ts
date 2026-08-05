"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentParty } from "@/lib/auth";
import { confirmationSchema } from "@/lib/validation";
import { recomputeReputation } from "@/lib/reputation";
import type { ConfirmationOutcome } from "@/generated/prisma/client";

export type ConfirmActionState = { error?: string };

export async function respondToMatch(formData: FormData) {
  const party = await getCurrentParty();
  if (!party) return;

  const id = String(formData.get("id"));
  const decision = String(formData.get("decision"));
  if (decision !== "ACCEPTED" && decision !== "DECLINED") return;

  const match = await prisma.match.findUnique({
    where: { id },
    select: { postA: { select: { partyId: true } }, postB: { select: { partyId: true } } },
  });
  if (!match) return;

  const ownsMatch =
    match.postA.partyId === party.id || match.postB.partyId === party.id;
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
      postA: { select: { partyId: true } },
      postB: { select: { partyId: true } },
    },
  });
  if (!match || match.status !== "ACCEPTED") {
    return { error: "This match isn't in a confirmable state" };
  }

  const counterpartyId =
    match.postA.partyId === party.id ? match.postB.partyId : match.postA.partyId;
  if (match.postA.partyId !== party.id && match.postB.partyId !== party.id) {
    return { error: "Not part of this match" };
  }

  await prisma.transactionConfirmation.upsert({
    where: { matchId_partyId: { matchId, partyId: party.id } },
    create: {
      matchId,
      partyId: party.id,
      outcome: outcome as ConfirmationOutcome,
      notes: comment,
    },
    update: { outcome: outcome as ConfirmationOutcome, notes: comment },
  });

  if (score) {
    await prisma.rating.upsert({
      where: {
        matchId_authorId_subjectId: {
          matchId,
          authorId: party.id,
          subjectId: counterpartyId,
        },
      },
      create: {
        matchId,
        authorId: party.id,
        subjectId: counterpartyId,
        score,
        comment,
      },
      update: { score, comment },
    });
  }

  const confirmationCount = await prisma.transactionConfirmation.count({
    where: { matchId },
  });
  if (confirmationCount >= 2) {
    await prisma.match.update({
      where: { id: matchId },
      data: { status: "COMPLETED" },
    });
  }

  await Promise.all([
    recomputeReputation(party.id),
    recomputeReputation(counterpartyId),
  ]);

  revalidatePath("/dashboard/opportunities");
  revalidatePath("/dashboard/directory");
  return {};
}

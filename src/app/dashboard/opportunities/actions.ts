"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentParty } from "@/lib/auth";
import { confirmationSchema } from "@/lib/validation";
import { recomputeReputation } from "@/lib/reputation";
import { recomputeRelation } from "@/lib/relations";
import { recordCompletedTrade } from "@/lib/memory";
import type { TrustDimension } from "@/generated/prisma/enums";
import { logger } from "@/lib/logger";
import { Prisma, type ConfirmationOutcome } from "@/generated/prisma/client";

export type ConfirmActionState = { error?: string };

// Fired once client-side when the Opportunities page actually mounts (see
// mark-seen.tsx) — not during the page's own render. A render-time write
// was previously done from the Overview page instead, which was wrong on
// two counts: writes during a Server Component render aren't guaranteed
// exactly-once (prefetch, retries), and it marked things "seen" on a page
// that isn't Opportunities, silently zeroing the "new matches" counter
// before the user ever looked at it.
export async function markOpportunitiesSeen() {
  const party = await getCurrentParty();
  if (!party) return;

  await prisma.party.update({
    where: { id: party.id },
    data: { opportunitiesLastSeenAt: new Date() },
  });
}

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
    communication: formData.get("communication") || undefined,
    reliability: formData.get("reliability") || undefined,
    quality: formData.get("quality") || undefined,
    payment: formData.get("payment") || undefined,
    timeliness: formData.get("timeliness") || undefined,
    fairness: formData.get("fairness") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { matchId, outcome, score, comment } = parsed.data;

  // Only the dimensions this rater actually answered. An unanswered
  // dimension stays absent rather than defaulting to the overall score,
  // which would fabricate a signal nobody gave.
  const dimensionScores: { dimension: TrustDimension; score: number }[] = (
    [
      ["COMMUNICATION", parsed.data.communication],
      ["RELIABILITY", parsed.data.reliability],
      ["QUALITY", parsed.data.quality],
      ["PAYMENT", parsed.data.payment],
      ["TIMELINESS", parsed.data.timeliness],
      ["FAIRNESS", parsed.data.fairness],
    ] as const
  )
    .filter((entry): entry is readonly [TrustDimension, number] => entry[1] != null)
    .map(([dimension, value]) => ({ dimension, score: value }));

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

  // Everything below is one transaction: the confirmation, the optional
  // rating, the match-completion flip, and both reputation recomputes (plus
  // the relation recompute) either all land or none do. Previously these
  // were 5+ sequential, untransacted writes — a crash mid-sequence left
  // Reputation permanently inconsistent with the confirmations it's
  // supposed to be derived from, with nothing to detect or repair it.
  try {
    await prisma.$transaction(async (tx) => {
      // Append-only: a confirmation, once logged, is evidence — never
      // silently overwritten by a resubmission. The UI already hides the
      // form after a first submission; this is what actually enforces it,
      // since a server action is a POST endpoint anyone can hit directly.
      await tx.transactionConfirmation.create({
        data: {
          matchId,
          partyId: party.id,
          outcome: outcome as ConfirmationOutcome,
          notes: comment,
        },
      });

      if (score) {
        try {
          await tx.rating.create({
            data: {
              matchId,
              authorId: party.id,
              subjectId: counterpartyId,
              score,
              comment,
              dimensions: dimensionScores.length
                ? { create: dimensionScores }
                : undefined,
            },
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
          // Duplicate rating specifically (not a duplicate confirmation,
          // which would already have thrown above) — silently ignored,
          // same as before: the transaction still completes.
        }
      }

      const confirmationCount = await tx.transactionConfirmation.count({
        where: { matchId },
      });
      let justCompleted = false;
      if (confirmationCount >= 2) {
        const updated = await tx.match.updateMany({
          where: { id: matchId, status: { not: "COMPLETED" } },
          data: { status: "COMPLETED" },
        });
        justCompleted = updated.count > 0;
      }

      // Memory is written before the reputation recompute so both see the
      // same transaction — and only on the completing confirmation, so a
      // trade is remembered once rather than once per party confirming.
      if (justCompleted) {
        await recordCompletedTrade(matchId, tx);
      }

      await Promise.all([
        recomputeReputation(party.id, tx),
        recomputeReputation(counterpartyId, tx),
        ...(justCompleted ? [recomputeRelation(party.id, counterpartyId, tx)] : []),
      ]);
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "You've already logged this transaction" };
    }
    logger.error("confirmMatch.transaction_failed", {
      matchId,
      partyId: party.id,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  revalidatePath("/dashboard/opportunities");
  revalidatePath("/dashboard/directory");
  return {};
}

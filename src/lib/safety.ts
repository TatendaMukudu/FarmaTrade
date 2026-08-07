import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import type { ReportReason } from "@/generated/prisma/enums";

// Blocking, reporting and suspension — the controls a marketplace needs
// before it has a moderation team, not after.
//
// The design decision that matters here is that blocking is *mutual
// invisibility*. If A blocks B, neither sees the other anywhere: not in the
// directory, not in matching, not in market aggregates. A one-way "hide
// them from me" block leaves the blocked party free to keep watching your
// listings, keep getting matched to you, and reach you through the next
// suggestion — which is not a block, it is a mute, and telling someone
// they're protected when they aren't is worse than offering nothing.

// Every party this viewer can't see and who can't see them. Request-scoped
// because several places on one page need it (the directory list, the
// opportunity feed, a profile) and it's the same answer each time.
export const invisibleTo = cache(async (partyId: string): Promise<string[]> => {
  const blocks = await prisma.partyBlock.findMany({
    where: { OR: [{ actorId: partyId }, { targetId: partyId }] },
    select: { actorId: true, targetId: true },
  });

  const ids = new Set<string>();
  for (const b of blocks) ids.add(b.actorId === partyId ? b.targetId : b.actorId);
  return [...ids];
});

// A Prisma `where` fragment for "parties this viewer should be shown".
// Exported as a fragment rather than applied inside a wrapper query so it
// composes with the very different shapes of the directory, matching and
// suggestion queries without any of them needing to know the rule.
export async function visiblePartyFilter(viewerPartyId: string): Promise<Prisma.PartyWhereInput> {
  const hidden = await invisibleTo(viewerPartyId);
  return {
    suspendedAt: null,
    ...(hidden.length ? { id: { notIn: hidden } } : {}),
  };
}

// Same rule expressed against a Post's owner, for the matching and
// transport-suggestion queries which filter posts rather than parties.
export async function visiblePostPartyFilter(
  viewerPartyId: string,
): Promise<Prisma.PostWhereInput> {
  const hidden = await invisibleTo(viewerPartyId);
  return {
    party: { suspendedAt: null },
    ...(hidden.length ? { partyId: { notIn: hidden } } : {}),
  };
}

export async function blockParty(actorId: string, targetId: string, reason?: string) {
  if (actorId === targetId) return;

  await prisma.partyBlock.upsert({
    where: { actorId_targetId: { actorId, targetId } },
    create: { actorId, targetId, reason },
    update: { reason },
  });

  // Existing suggestions between the two are withdrawn immediately.
  // Leaving them in place would mean the block only applies to matches
  // generated after it — so the person you just blocked stays at the top of
  // your opportunities page, which is precisely the moment the feature has
  // to work.
  await prisma.match.updateMany({
    where: {
      status: "SUGGESTED",
      OR: [
        { postA: { partyId: actorId }, postB: { partyId: targetId } },
        { postA: { partyId: targetId }, postB: { partyId: actorId } },
      ],
    },
    data: { status: "DECLINED" },
  });

  await recordAudit({ action: "PARTY_BLOCKED", partyId: actorId, subjectId: targetId });
}

export async function unblockParty(actorId: string, targetId: string) {
  await prisma.partyBlock.deleteMany({ where: { actorId, targetId } });
  await recordAudit({ action: "PARTY_UNBLOCKED", partyId: actorId, subjectId: targetId });
}

export async function fileReport(input: {
  reporterId: string;
  subjectId: string;
  reason: ReportReason;
  detail?: string;
  postId?: string;
  matchId?: string;
}) {
  if (input.reporterId === input.subjectId) return;

  await prisma.report.create({
    data: {
      reporterId: input.reporterId,
      subjectId: input.subjectId,
      reason: input.reason,
      detail: input.detail,
      postId: input.postId,
      matchId: input.matchId,
    },
  });

  await recordAudit({
    action: "REPORT_FILED",
    partyId: input.reporterId,
    subjectId: input.subjectId,
    detail: input.reason,
  });
}

export const isBlocked = cache(async (viewerId: string, otherId: string) => {
  const hidden = await invisibleTo(viewerId);
  return hidden.includes(otherId);
});

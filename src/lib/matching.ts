import "server-only";
import { prisma } from "@/lib/prisma";
import type { Post, Reputation, VerificationSource } from "@/generated/prisma/client";

// Deterministic, rules-based scoring — no ML, no history to learn from yet.
// Geography and category are the qualifying filters (local-first: a match is
// only ever suggested within the same province); reputation only ever adds,
// never subtracts, so new parties with no history aren't penalized.
//
// The score is never handed downstream on its own — it's cited. Each reason
// is plain language a projection layer (this UI today, WhatsApp phrasing
// later) can render directly instead of inventing its own justification.
function scoreMatch(
  candidate: Post,
  newPost: Post,
  reputation: Reputation | null,
  verifiedBy: VerificationSource | null,
): { score: number; reasons: string[] } {
  let score = 50;
  const reasons: string[] = ["same province"];

  if (candidate.district === newPost.district) {
    score += 20;
    reasons.push("same district");
  }

  if (reputation?.averageRating && reputation.ratingCount >= 3) {
    score += (reputation.averageRating / 5) * 20;
    reasons.push(
      `counterparty: ${reputation.completedCount} completed, ${reputation.averageRating.toFixed(1)}★ (${reputation.ratingCount} ratings)`,
    );
  } else if (reputation?.completedCount) {
    score += Math.min(reputation.completedCount, 10);
    reasons.push(`counterparty: ${reputation.completedCount} completed (still building rating history)`);
  } else {
    reasons.push("counterparty: new, no history yet");
  }

  if (verifiedBy) {
    score += 10;
    reasons.push(
      verifiedBy === "FOUNDER" ? "founder-vouched" : "network-referred",
    );
  }

  if (candidate.urgent || newPost.urgent) {
    reasons.push("time-sensitive");
  }

  return { score: Math.round(Math.min(score, 100)), reasons };
}

// Called right after a Post is created. Finds OPEN posts of the opposite
// type in the same category and province, and records a Match for each.
// postA is always the pre-existing post, postB the one just created, so
// re-running this never produces a duplicate pair.
export async function generateMatchesForPost(postId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post || post.status !== "OPEN") return;

  const oppositeType = post.type === "HAVE" ? "NEED" : "HAVE";

  const candidates = await prisma.post.findMany({
    where: {
      type: oppositeType,
      category: post.category,
      province: post.province,
      status: "OPEN",
      partyId: { not: post.partyId },
    },
    include: { party: { include: { reputation: true } } },
  });

  if (candidates.length === 0) return;

  await prisma.match.createMany({
    data: candidates.map((candidate) => {
      const { score, reasons } = scoreMatch(
        candidate,
        post,
        candidate.party.reputation,
        candidate.party.verifiedBy,
      );
      return { postAId: candidate.id, postBId: post.id, score, reasons };
    }),
    skipDuplicates: true,
  });
}

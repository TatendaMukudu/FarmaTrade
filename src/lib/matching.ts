import "server-only";
import { prisma } from "@/lib/prisma";
import type { Post, Reputation } from "@/generated/prisma/client";

// Deterministic, rules-based scoring — no ML, no history to learn from yet.
// Geography and category are the qualifying filters (local-first: a match is
// only ever suggested within the same province); reputation only ever adds,
// never subtracts, so new parties with no history aren't penalized.
function scoreMatch(candidate: Post, newPost: Post, reputation: Reputation | null) {
  let score = 50;

  if (candidate.district === newPost.district) {
    score += 20;
  }

  if (reputation?.averageRating) {
    score += (reputation.averageRating / 5) * 20;
  }
  if (reputation?.completedCount) {
    score += Math.min(reputation.completedCount, 10);
  }

  return Math.round(Math.min(score, 100));
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
    data: candidates.map((candidate) => ({
      postAId: candidate.id,
      postBId: post.id,
      score: scoreMatch(candidate, post, candidate.party.reputation),
    })),
    skipDuplicates: true,
  });
}

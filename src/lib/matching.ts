import "server-only";
import { prisma } from "@/lib/prisma";
import { scoreMatch } from "@/lib/matching-core";

export { scoreMatch };

// Without a cap, one new post in a busy province/category would write one
// Match row per open opposite-type post that qualifies — unbounded fan-out
// on the hot path a post-create request runs synchronously. Newest
// candidates first: a listing posted yesterday is more likely to still be
// live and relevant than one from months ago, so if there's a cut, this is
// the right end of the list to cut from.
const MAX_MATCH_CANDIDATES = 200;

// Called right after a Post is created. Finds OPEN posts of the opposite
// type in the same category, and records a Match for each. postA is always
// the pre-existing post, postB the one just created, so re-running this
// never produces a duplicate pair.
export async function generateMatchesForPost(postId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post || post.status !== "OPEN") return;

  const oppositeType = post.type === "HAVE" ? "NEED" : "HAVE";

  // Every other category is local-first: a match is only ever suggested
  // within the same province. TRANSPORT is the one exception — a
  // transporter's route (origin -> destination) can serve a pickup or
  // drop-off point that isn't in the same province as either end alone.
  const geoFilter =
    post.category === "TRANSPORT"
      ? {
          OR: [
            { province: post.province },
            { destinationProvince: post.province },
            ...(post.destinationProvince ? [{ province: post.destinationProvince }] : []),
          ],
        }
      : { province: post.province };

  const candidates = await prisma.post.findMany({
    where: {
      type: oppositeType,
      category: post.category,
      status: "OPEN",
      partyId: { not: post.partyId },
      ...geoFilter,
    },
    include: { party: { include: { reputation: true } } },
    orderBy: { createdAt: "desc" },
    take: MAX_MATCH_CANDIDATES,
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

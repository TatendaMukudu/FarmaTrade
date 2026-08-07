import "server-only";
import { prisma } from "@/lib/prisma";
import { scoreMatch } from "@/lib/matching-core";
import { objectiveSpec } from "@/lib/objectives";
import { visiblePostPartyFilter } from "@/lib/safety";
import {
  boundingBox,
  distanceKm,
  DEFAULT_OPERATING_RADIUS_KM,
  TRANSPORT_RADIUS_KM,
} from "@/lib/geo-core";

export { scoreMatch };

// Without a cap, one new post in a busy area would write one Match row per
// open counterpart post that qualifies — unbounded fan-out on the hot path
// a post-create request runs synchronously. Newest candidates first: a
// listing posted yesterday is more likely to still be live than one from
// months ago, so if there's a cut, this is the right end to cut from.
const MAX_MATCH_CANDIDATES = 200;

// The box is a superset of the circle, so it over-selects at the corners.
// Pulling a few extra rows and measuring them exactly is much cheaper than
// asking the database for a great-circle distance it can't index.
const CANDIDATE_SCAN_LIMIT = MAX_MATCH_CANDIDATES * 3;

// Called right after a Post is created. Finds OPEN posts carrying the
// counterpart objective in the same category, *within travelling distance*,
// and records a Match for each.
//
// Distance, not administrative name. The old rule was `region = region`,
// which meant a Mutare farmer could match Bulawayo (580km, same country)
// but never Beira (290km, over a border) — and which stopped meaning
// anything at all outside Zimbabwe, since a US state can be larger than
// this entire country. Radius matching is simultaneously the fix for match
// quality and the thing that makes the product work in more than one
// market: they were always the same problem.
export async function generateMatchesForPost(postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { party: { select: { operatingRadiusKm: true } } },
  });
  if (!post || post.status !== "OPEN") return;

  const counterpartObjective = objectiveSpec(post.objective).counterpart;
  const safetyFilter = await visiblePostPartyFilter(post.partyId);

  const baseWhere = {
    objective: counterpartObjective,
    category: post.category,
    status: "OPEN" as const,
    partyId: { not: post.partyId },
    ...safetyFilter,
  };

  // A haulier running a route is in the business of covering distance, so
  // their catchment is a corridor rather than a circle around home. Same
  // exception the old rule carved out, expressed in kilometres.
  const radiusKm =
    post.category === "TRANSPORT"
      ? TRANSPORT_RADIUS_KM
      : (post.party.operatingRadiusKm ?? DEFAULT_OPERATING_RADIUS_KM);

  const origin =
    post.latitude != null && post.longitude != null
      ? { latitude: post.latitude, longitude: post.longitude }
      : null;

  // Unplaced posts fall back to the old same-region rule. A party who typed
  // a region we don't recognise has no coordinates, and guessing one would
  // put them somewhere wrong — better to match conservatively than
  // confidently in the wrong place.
  if (!origin) {
    const fallback = await prisma.post.findMany({
      where: { ...baseWhere, countryCode: post.countryCode, region: post.region },
      include: { party: { include: { reputation: true } } },
      orderBy: { createdAt: "desc" },
      take: MAX_MATCH_CANDIDATES,
    });
    await writeMatches(post, fallback.map((c) => ({ candidate: c, distance: null })));
    return;
  }

  const box = boundingBox(origin, radiusKm);
  const candidates = await prisma.post.findMany({
    where: {
      ...baseWhere,
      latitude: { gte: box.minLatitude, lte: box.maxLatitude },
      longitude: { gte: box.minLongitude, lte: box.maxLongitude },
    },
    include: { party: { include: { reputation: true } } },
    orderBy: { createdAt: "desc" },
    take: CANDIDATE_SCAN_LIMIT,
  });

  // Exact distance, then nearest first — so when the cap bites, it drops
  // the furthest rather than the oldest.
  const withinRadius = candidates
    .flatMap((candidate) => {
      if (candidate.latitude == null || candidate.longitude == null) return [];
      const distance = distanceKm(origin, {
        latitude: candidate.latitude,
        longitude: candidate.longitude,
      });
      return distance <= radiusKm ? [{ candidate, distance }] : [];
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_MATCH_CANDIDATES);

  await writeMatches(post, withinRadius);
}

type Candidate = Awaited<ReturnType<typeof prisma.post.findMany>>[number] & {
  party: { reputation: unknown; verifiedBy: unknown };
};

async function writeMatches(
  post: Parameters<typeof scoreMatch>[1],
  scored: { candidate: Candidate; distance: number | null }[],
) {
  if (scored.length === 0) return;

  await prisma.match.createMany({
    data: scored.map(({ candidate, distance }) => {
      const { score, reasons } = scoreMatch(
        candidate,
        post,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (candidate.party as any).reputation,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (candidate.party as any).verifiedBy,
        distance,
      );
      return { postAId: candidate.id, postBId: post.id, score, reasons };
    }),
    skipDuplicates: true,
  });
}

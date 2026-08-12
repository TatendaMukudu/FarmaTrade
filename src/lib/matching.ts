import "server-only";
import { prisma } from "@/lib/prisma";
import { scoreMatch } from "@/lib/matching-core";
import { directionOf, typeForDirection } from "@/lib/intent";

export { scoreMatch };

// Called right after an intent becomes active. Finds active intents facing
// the opposite way, for a compatible product in a reachable place, and
// records a Match for each.
//
// postA/postB on Match are persistence names — postA is always the
// pre-existing intent, postB the one just activated, so re-running this
// never produces a duplicate pair. See src/lib/intent.ts for why the domain
// says Intent while the table still says Post.
//
// PROPOSED intents (stored status DRAFT) are deliberately excluded:
// FarmaTrade suggested those and the farmer has not confirmed them, so
// matching on one would be putting words in their mouth.
export async function generateMatchesForIntent(intentId: string) {
  const post = await prisma.post.findUnique({ where: { id: intentId } });
  if (!post || post.status !== "OPEN") return;

  // The other side of the market from this one.
  const oppositeType = typeForDirection(directionOf(post.type) === "SUPPLY" ? "DEMAND" : "SUPPLY");

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

  // Local candidates: the same country, and near enough within it to be
  // worth a farmer's attention. This is what almost every post gets, and
  // adding the country guard is what stops two same-named provinces in
  // different countries from silently matching each other.
  const local = { countryCode: post.countryCode, ...geoFilter };

  // Cross-border candidates, only when this post asked for them, and only
  // posts that asked back. A farmer exporting into the region gets the
  // international market; a smallholder listing two tonnes of tomatoes never
  // sees it. Geography is deliberately not applied here — the whole point of
  // opting in is that distance has stopped being the disqualifier.
  const reach = post.openToCrossBorder
    ? { OR: [local, { openToCrossBorder: true, partyId: { not: post.partyId } }] }
    : local;

  // Commodity identity, where both sides have one.
  //
  // This is a filter rather than a score: a maize seller and a tomato buyer
  // are not a weak match, they are not a match. Until now they paired
  // happily because both posts were PRODUCE.
  //
  // Unknown on either side means "can't rule it out" and falls through to
  // the category check that has always governed matching — so posts that
  // predate the product catalogue, and categories that have no product
  // identity at all (transport, services, inputs), behave exactly as before.
  const productFilter = post.productId
    ? { OR: [{ productId: post.productId }, { productId: null }] }
    : {};

  // Combined under AND rather than spread into one object: both `reach` and
  // `productFilter` can carry their own `OR`, and spreading them would let
  // the second silently overwrite the first — dropping a filter without any
  // error, which is the worst way for a matching constraint to fail.
  const candidates = await prisma.post.findMany({
    where: {
      type: oppositeType,
      category: post.category,
      status: "OPEN",
      partyId: { not: post.partyId },
      AND: [productFilter, reach],
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

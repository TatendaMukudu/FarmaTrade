import "server-only";
import { prisma } from "@/lib/prisma";
import { scoreMatch } from "@/lib/matching-core";
import { isMatchable, oppositeSide } from "@/lib/intent";
import { loadCapacities, loadCapacity } from "@/lib/allocation";

export { scoreMatch };

// Called right after an intent becomes active. Finds intents facing the
// opposite way, for a compatible product in a reachable place, with capacity
// still available on both sides, and records a Match for each.
//
// intentA is always the pre-existing intent and intentB the one just
// activated, so re-running this never produces a duplicate pair.
//
// Eligibility is a question about remaining capacity, not about status
// alone. An intent already in discussion still has whatever it has not
// agreed away, and it stays in the candidate pool for as long as that is
// more than nothing — a farmer who agreed 8 of 20 tonnes should keep
// hearing about buyers for the other 12. What removes an intent is being
// fully spoken for, or never having been authorized in the first place.
//
// A PROPOSED intent is excluded however much it offers: FarmaTrade derived
// it and its owner has not agreed to it, so matching on one would be putting
// words in their mouth.
export async function generateMatchesForIntent(intentId: string) {
  const intent = await prisma.intent.findUnique({ where: { id: intentId } });
  if (!intent) return;

  const capacity = await loadCapacity(intentId);
  if (!isMatchable({ status: intent.status, remaining: capacity?.remaining ?? null })) return;

  // Every other category is local-first: a match is only ever suggested
  // within the same province. TRANSPORT is the one exception — a
  // transporter's route (origin -> destination) can serve a pickup or
  // drop-off point that isn't in the same province as either end alone.
  const geoFilter =
    intent.category === "TRANSPORT"
      ? {
          OR: [
            { province: intent.province },
            { destinationProvince: intent.province },
            ...(intent.destinationProvince ? [{ province: intent.destinationProvince }] : []),
          ],
        }
      : { province: intent.province };

  // Local candidates: the same country, and near enough within it to be
  // worth a farmer's attention. This is what almost every post gets, and
  // adding the country guard is what stops two same-named provinces in
  // different countries from silently matching each other.
  const local = { countryCode: intent.countryCode, ...geoFilter };

  // Cross-border candidates, only when this intent asked for them, and only
  // intents that asked back. A farmer exporting into the region gets the
  // international market; a smallholder listing two tonnes of tomatoes never
  // sees it. Geography is deliberately not applied here — the whole point of
  // opting in is that distance has stopped being the disqualifier.
  const reach = intent.openToCrossBorder
    ? { OR: [local, { openToCrossBorder: true, partyId: { not: intent.partyId } }] }
    : local;

  // Commodity identity, where both sides have one.
  //
  // This is a filter rather than a score: a maize seller and a tomato buyer
  // are not a weak match, they are not a match. Until now they paired
  // happily because both were PRODUCE.
  //
  // Unknown on either side means "can't rule it out" and falls through to
  // the category check that has always governed matching — so intents that
  // predate the product catalogue, and categories that have no product
  // identity at all (transport, services, inputs), behave exactly as before.
  const productFilter = intent.productId
    ? { OR: [{ productId: intent.productId }, { productId: null }] }
    : {};

  // Combined under AND rather than spread into one object: both `reach` and
  // `productFilter` can carry their own `OR`, and spreading them would let
  // the second silently overwrite the first — dropping a filter without any
  // error, which is the worst way for a matching constraint to fail.
  const authorized = await prisma.intent.findMany({
    where: {
      side: oppositeSide(intent.side),
      category: intent.category,
      // Both states the owner consented to. Which of the two an intent is
      // in says whether anyone is talking to them, not whether they have
      // anything left; the capacity filter below decides that.
      status: { in: ["ACTIVE", "ENGAGED"] },
      partyId: { not: intent.partyId },
      AND: [productFilter, reach],
    },
    include: { party: { include: { reputation: true } } },
  });

  if (authorized.length === 0) return;

  // Remaining capacity is a sum over engagements rather than a column, so it
  // is filtered here rather than in the query above. One extra round trip
  // for every candidate at once — cheap at this scale, and the alternative
  // is a stored counter that can disagree with the engagements justifying
  // it. If this ever becomes the bottleneck, the fix is a materialized view
  // or a cached column with the sum as its source of truth, not a second
  // number people are trusted to keep up to date.
  //
  // Quantity compatibility deliberately stops here. Two sides are eligible
  // when both have something left, not when their amounts are similar: a
  // supplier with 12 tonnes and a buyer needing 100 is a real trade for 12,
  // and partial fulfilment is how a 100-tonne order gets filled at all.
  // Nothing requires the numbers to be equal, or even close, and differing
  // units are not a disqualification either — those parties can still
  // trade; FarmaTrade simply will not claim to know how much until there is
  // a conversion layer that makes such a claim true.
  const capacities = await loadCapacities(authorized.map((c) => c.id));
  const candidates = authorized.filter((candidate) =>
    isMatchable({
      status: candidate.status,
      remaining: capacities.get(candidate.id)?.remaining ?? null,
    }),
  );

  if (candidates.length === 0) return;

  await prisma.match.createMany({
    data: candidates.map((candidate) => {
      const { score, reasons } = scoreMatch(
        candidate,
        intent,
        candidate.party.reputation,
        candidate.party.verifiedBy,
      );
      return { intentAId: candidate.id, intentBId: intent.id, score, reasons };
    }),
    skipDuplicates: true,
  });
}

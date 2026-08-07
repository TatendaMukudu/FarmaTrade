import "server-only";
import { prisma } from "@/lib/prisma";

export type RouteEnd = { region: string; locality: string };

const MAX_SUGGESTIONS = 5;

// A PRODUCE/LIVESTOCK/EQUIPMENT/INPUTS match and a TRANSPORT match are two
// separate graphs today — a farmer whose sale just got accepted has no way
// to find a transporter whose route covers the delivery without separately
// posting a TRANSPORT NEED and waiting for the matching engine to run
// again. This closes that gap directly: given the trade's origin (where the
// goods are) and destination (where they need to go), find open TRANSPORT
// HAVE posts that actually cover it.
//
// A transporter covers a route if they're based where the goods currently
// are (so they can actually do the pickup) and — if they've said where
// they're headed — that destination lines up with where the goods need to
// go. A transporter with no stated destination isn't ruled out: the post
// form's own default for that field is "Not sure yet", so absence isn't a
// mismatch, it's an open route. Expressed directly as a WHERE clause
// (rather than fetching every open TRANSPORT post nationally and filtering
// in JavaScript) since the whole predicate is just two column comparisons —
// no reason to pull rows across the wire just to throw most of them away.
export async function findTransportersForRoute(origin: RouteEnd, destination: RouteEnd) {
  return prisma.post.findMany({
    where: {
      type: "HAVE",
      category: "TRANSPORT",
      status: "OPEN",
      region: origin.region,
      OR: [{ destinationProvince: null }, { destinationProvince: destination.region }],
    },
    include: { party: { include: { reputation: true } } },
    orderBy: { createdAt: "desc" },
    take: MAX_SUGGESTIONS,
  });
}

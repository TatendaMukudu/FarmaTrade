import "server-only";
import { prisma } from "@/lib/prisma";
import { transportCoversRoute } from "@/lib/transport-suggestions-core";

export type RouteEnd = { province: string; district: string };

const MAX_SUGGESTIONS = 5;

// A PRODUCE/LIVESTOCK/EQUIPMENT/INPUTS match and a TRANSPORT match are two
// separate graphs today — a farmer whose sale just got accepted has no way
// to find a transporter whose route covers the delivery without separately
// posting a TRANSPORT NEED and waiting for the matching engine to run
// again. This closes that gap directly: given the trade's origin (where the
// goods are) and destination (where they need to go), find open TRANSPORT
// HAVE posts that actually cover it.
export async function findTransportersForRoute(origin: RouteEnd, destination: RouteEnd) {
  const candidates = await prisma.post.findMany({
    where: { type: "HAVE", category: "TRANSPORT", status: "OPEN" },
    include: { party: { include: { reputation: true } } },
    orderBy: { createdAt: "desc" },
  });

  return candidates
    .filter((post) => transportCoversRoute(post, origin, destination))
    .slice(0, MAX_SUGGESTIONS);
}

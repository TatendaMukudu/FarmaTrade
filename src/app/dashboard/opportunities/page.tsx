import Link from "next/link";
import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { respondToMatch } from "./actions";
import { ConfirmForm } from "./confirm-form";
import { summarizeReputation } from "@/lib/reputation";
import {
  resolveMatchSides,
  groupMatchesByOwnPost,
  combinedOfferedQuantity,
  distanceLabel,
  estimatedPostValue,
} from "@/lib/match-view";
import { loadMatchingHistory, toRankableMatch } from "@/lib/match-ranking";
import { planMatches, type Bucket } from "@/lib/match-rank";
import { Badge } from "@/components/badge";
import type { Post, Party, Reputation, Photo } from "@/generated/prisma/client";

type PartyWithReputation = Party & { reputation: Reputation | null };
type CounterpartPost = Post & { party: PartyWithReputation; photos: Pick<Photo, "id">[] };

// Buckets a farmer has to act on lead; "worth knowing" is context, so it
// gets a smaller allowance rather than competing for the same attention.
const BUCKET_LIMIT: Record<Bucket, number> = {
  time_critical: 5,
  in_progress: 5,
  needs_response: 5,
  worth_knowing: 3,
};

const SOLID_BUTTON =
  "rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent-hover";
const OUTLINE_BUTTON =
  "rounded-lg border border-accent px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent hover:text-accent-foreground";

export default async function OpportunitiesPage() {
  const party = await getCurrentParty();
  if (!party) return null;

  const [active, history, relations, matchingHistory] = await Promise.all([
    prisma.match.findMany({
      where: {
        status: { in: ["SUGGESTED", "ACCEPTED"] },
        OR: [{ postA: { partyId: party.id } }, { postB: { partyId: party.id } }],
      },
      include: {
        postA: {
          include: { party: { include: { reputation: true } }, photos: { select: { id: true } } },
        },
        postB: {
          include: { party: { include: { reputation: true } }, photos: { select: { id: true } } },
        },
        confirmations: true,
      },
      orderBy: { score: "desc" },
    }),
    prisma.match.findMany({
      where: {
        status: "COMPLETED",
        OR: [{ postA: { partyId: party.id } }, { postB: { partyId: party.id } }],
      },
      include: {
        postA: { include: { party: true } },
        postB: { include: { party: true } },
        confirmations: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.relation.findMany({
      where: { OR: [{ partyAId: party.id }, { partyBId: party.id }] },
    }),
    loadMatchingHistory(),
  ]);

  const strengthByCounterparty = new Map<string, number>();
  for (const r of relations) {
    const counterpartyId = r.partyAId === party.id ? r.partyBId : r.partyAId;
    strengthByCounterparty.set(counterpartyId, r.strength);
  }

  // One `now` for the whole render, so a deadline that falls between two
  // comparisons can't put a match in one bucket and rank it as another.
  const now = new Date();
  const plan = planMatches(
    active.map((m) => toRankableMatch(m, party.id, strengthByCounterparty)),
    { now, ...matchingHistory, limit: BUCKET_LIMIT },
  );

  // Coverage is computed over every active match, not per bucket — "how much
  // of my order is on the table" is a fact about the order, and slicing it
  // by how urgent each candidate happens to be would quietly understate it.
  const coverage = groupMatchesByOwnPost<CounterpartPost, (typeof active)[number]>(
    active,
    party.id,
  )
    .filter((g) => g.yours.type === "NEED" && g.yours.quantity != null && g.matches.length >= 2)
    .map((g) => ({
      yours: g.yours,
      count: g.matches.length,
      combined: combinedOfferedQuantity<CounterpartPost, (typeof active)[number]>(
        g.matches,
        party.id,
      ),
    }));

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold">Opportunities</h1>
        <p className="text-sm text-gray-500">
          Matches FarmaTrade found between your posts and the opposite side.
        </p>
      </div>

      {plan.empty && <p className="text-sm text-gray-400">{plan.message}</p>}

      {coverage.length > 0 && (
        <div className="flex flex-col gap-3">
          {coverage.map(({ yours, count, combined }) => {
            const needed = yours.quantity ?? 0;
            return (
              <div key={yours.id} className="rounded-lg border border-border bg-new-bg p-3">
                <p className="text-sm font-medium text-new-fg">
                  Combined available for &ldquo;{yours.title}&rdquo;: {combined.toLocaleString()} /{" "}
                  {needed.toLocaleString()} {yours.unit ?? ""} across {count} matches
                </p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${Math.min(100, (combined / needed) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!plan.empty &&
        plan.groups.map((group) => (
          <div key={group.bucket} className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">{group.label}</h2>
            {group.empty ? (
              <p className="text-sm text-gray-400">{group.message}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {group.matches.map((ranked) => {
                  const m = ranked.match.source;
                  const { yours, theirs } = resolveMatchSides<CounterpartPost>(m, party.id);
                  const myConfirmation = m.confirmations.find((c) => c.partyId === party.id);
                  const strength = strengthByCounterparty.get(theirs.party.id);
                  return (
                    <li key={m.id} className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                            <span>{m.status}</span>
                            {(yours.urgent || theirs.urgent) && <Badge tone="warning">Time-sensitive</Badge>}
                            {strength && strength >= 2 && (
                              <Badge tone="info">Preferred partner · {strength} completed</Badge>
                            )}
                            <span>Evidence {ranked.confidence.replace(/_/g, " ")}</span>
                          </div>
                          <p className="mt-1 font-medium">Your post: {yours.title}</p>
                          <MatchCounterpart post={theirs} myDistrict={party.district} myProvince={party.province} />
                          {m.reasons.length > 0 && (
                            <p className="mt-2 text-sm font-medium text-foreground">
                              Why: <span className="font-normal">{m.reasons.join(" · ")}</span>
                            </p>
                          )}
                          {/* What has happened before on this route, in
                              counts rather than forecasts. Absent entirely
                              when there isn't enough history to say
                              something honest. */}
                          {ranked.lane?.line && (
                            <p className="mt-2 text-sm text-gray-600">
                              Track record: {ranked.lane.line}
                              {ranked.lane.classLine && ` ${ranked.lane.classLine}`}
                            </p>
                          )}
                          {/* The ordering is inspectable on purpose — a rank
                              nobody can see the working for is one nobody can
                              tell us is wrong. Kept out of the farmer's way
                              in production; it is a debugging aid, not
                              something a buyer needs to read. */}
                          {process.env.NODE_ENV !== "production" && (
                            <p className="mt-1 text-xs text-gray-400">
                              Ranked {ranked.rank} · {ranked.rationale.join(" · ")}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          {m.status === "SUGGESTED" && (
                            <form action={respondToMatch} className="flex gap-2">
                              <input type="hidden" name="id" value={m.id} />
                              <button type="submit" name="decision" value="ACCEPTED" className={SOLID_BUTTON}>
                                Accept
                              </button>
                              <button type="submit" name="decision" value="DECLINED" className={OUTLINE_BUTTON}>
                                Decline
                              </button>
                            </form>
                          )}
                          <div className="flex gap-2">
                            <Link href={`/dashboard/conversations/${m.id}`} className={OUTLINE_BUTTON}>
                              Message
                            </Link>
                            <Link href={`/dashboard/directory/${theirs.party.id}`} className={OUTLINE_BUTTON}>
                              View profile
                            </Link>
                          </div>
                        </div>
                      </div>
                      {m.status === "ACCEPTED" && (
                        <div className="mt-4 border-t border-border pt-4">
                          {myConfirmation ? (
                            <p className="text-sm text-gray-500">
                              You reported: {myConfirmation.outcome.replace(/_/g, " ")}.
                              Waiting on {theirs.party.name} to confirm their side.
                            </p>
                          ) : (
                            <ConfirmForm matchId={m.id} counterpartyName={theirs.party.name} />
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {group.hidden > 0 && (
              <p className="text-xs text-gray-400">
                {group.hidden} more in this section, ranked lower.
              </p>
            )}
          </div>
        ))}

      {history.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">History</h2>
          <ul className="flex flex-col gap-2">
            {history.map((m) => {
              const { yours, theirs } = resolveMatchSides(m, party.id);
              const myConfirmation = m.confirmations.find(
                (c) => c.partyId === party.id,
              );
              return (
                <li
                  key={m.id}
                  className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-gray-600"
                >
                  {yours.title} ↔ {theirs.party.name} ({theirs.title}) ·{" "}
                  {myConfirmation?.outcome.replace(/_/g, " ") ?? "—"}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function MatchCounterpart({
  post,
  myDistrict,
  myProvince,
}: {
  post: CounterpartPost;
  myDistrict: string;
  myProvince: string;
}) {
  const reputation = summarizeReputation(post.party.reputation);
  const estimatedValue = estimatedPostValue(post);

  return (
    <div className="mt-1">
      <p className="text-sm text-gray-600">
        {post.party.name} {post.type === "HAVE" ? "has" : "needs"}: {post.title}
        {post.recurring && (
          <Badge tone="info" className="ml-2">
            Standing order
          </Badge>
        )}
      </p>
      <p className="text-xs text-gray-400">
        {reputation.headline}
        {reputation.hasHistory && ` · ${reputation.completedLine}`} ·{" "}
        {distanceLabel(post.district, post.province, myDistrict, myProvince)}
        {estimatedValue != null && ` · Est. value $${estimatedValue.toLocaleString()}`}
        {post.destinationDistrict &&
          post.destinationProvince &&
          ` · Route: ${post.district} → ${post.destinationDistrict}`}
      </p>
      {post.photos.length > 0 && (
        <div className="mt-2 flex gap-2">
          {post.photos.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.id}
              src={`/api/photos/${photo.id}`}
              alt=""
              className="h-16 w-16 rounded object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );
}

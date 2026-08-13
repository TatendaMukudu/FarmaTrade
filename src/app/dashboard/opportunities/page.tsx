import Link from "next/link";
import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { respondToMatch } from "./actions";
import { ConfirmForm } from "./confirm-form";
import { summarizeReputation } from "@/lib/reputation";
import {
  resolveMatchSides,
  groupMatchesByOwnIntent,
  combinedOfferedQuantity,
  distanceLabel,
  estimatedIntentValue,
} from "@/lib/match-view";
import { loadMatchingHistory, toRankableMatch } from "@/lib/match-ranking";
import { planMatches, type Bucket } from "@/lib/match-rank";
import { formatMoney, regionFor } from "@/lib/regions";
import { pluralizeUnit } from "@/lib/units";
import { Badge } from "@/components/badge";
import { SproutIcon } from "@/components/icons";
import { EmptyState, SectionHeading, buttonClass } from "@/components/ui";
import type { Intent, Party, Reputation, Photo } from "@/generated/prisma/client";

type PartyWithReputation = Party & { reputation: Reputation | null };
type CounterpartPost = Intent & { party: PartyWithReputation; photos: Pick<Photo, "id">[] };

// Buckets a farmer has to act on lead; "worth knowing" is context, so it
// gets a smaller allowance rather than competing for the same attention.
const BUCKET_LIMIT: Record<Bucket, number> = {
  time_critical: 5,
  in_progress: 5,
  needs_response: 5,
  worth_knowing: 3,
};

// Enums spelled for a human. "COMPLETED GOOD" and "MATCHED" were leaking
// straight through to the page.
const MATCH_STATUS_LABEL: Record<string, string> = {
  SUGGESTED: "Suggested",
  ACCEPTED: "Agreed",
  DECLINED: "Declined",
  COMPLETED: "Completed",
};

// How much is actually known about this counterparty, said plainly. The
// tier names are ours; a farmer should read what they mean.
const CONFIDENCE_LABEL: Record<string, string> = {
  confirmed: "Well-established trader",
  reliable: "Has traded before",
  promising: "Vouched for, no trades yet",
  calibrating: "New — no history yet",
};

const OUTCOME_LABEL: Record<string, string> = {
  COMPLETED_GOOD: "Went well",
  COMPLETED_ISSUE: "Completed, with an issue",
  DID_NOT_HAPPEN: "Did not happen",
};

const SOLID_BUTTON = buttonClass("primary", "sm");
const OUTLINE_BUTTON = buttonClass("secondary", "sm");

export default async function OpportunitiesPage() {
  const party = await getCurrentParty();
  if (!party) return null;

  const [active, history, relations, matchingHistory] = await Promise.all([
    prisma.match.findMany({
      where: {
        status: { in: ["SUGGESTED", "ACCEPTED"] },
        OR: [{ intentA: { partyId: party.id } }, { intentB: { partyId: party.id } }],
      },
      include: {
        intentA: {
          include: { party: { include: { reputation: true } }, photos: { select: { id: true } } },
        },
        intentB: {
          include: { party: { include: { reputation: true } }, photos: { select: { id: true } } },
        },
        confirmations: true,
      },
      orderBy: { score: "desc" },
    }),
    prisma.match.findMany({
      where: {
        status: "COMPLETED",
        OR: [{ intentA: { partyId: party.id } }, { intentB: { partyId: party.id } }],
      },
      include: {
        intentA: { include: { party: true } },
        intentB: { include: { party: true } },
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
  const coverage = groupMatchesByOwnIntent<CounterpartPost, (typeof active)[number]>(
    active,
    party.id,
  )
    .filter((g) => g.yours.side === "DEMAND" && g.yours.quantity != null && g.matches.length >= 2)
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
        <p className="text-sm text-muted-fg">
          What FarmaTrade found between your supply and needs and the rest of the network.
        </p>
      </div>

      {plan.empty && (
        <EmptyState
          icon={<SproutIcon />}
          title="No opportunities yet"
          hint="Record what you have available and what you are looking for, and FarmaTrade matches it against the network."
          action={{ href: "/dashboard/intent", label: "Add supply or a need" }}
        />
      )}

      {coverage.length > 0 && (
        <div className="flex flex-col gap-3">
          {coverage.map(({ yours, count, combined }) => {
            const needed = yours.quantity ?? 0;
            return (
              <div key={yours.id} className="rounded-card border border-border bg-new-bg p-3">
                <p className="text-sm font-medium text-new-fg">
                  Combined available for &ldquo;{yours.title}&rdquo;: {combined.toLocaleString()} /{" "}
                  {needed.toLocaleString()} {yours.unit ? pluralizeUnit(yours.unit, needed) : ""} across {count} matches
                </p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-pill bg-border">
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
            <SectionHeading title={group.label} count={group.matches.length} />
            {group.empty ? (
              <p className="rounded-card border border-dashed border-border px-4 py-3 text-sm text-muted-fg">
                {group.message}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {group.matches.map((ranked) => {
                  const m = ranked.match.source;
                  const { yours, theirs } = resolveMatchSides<CounterpartPost>(m, party.id);
                  const myConfirmation = m.confirmations.find((c) => c.partyId === party.id);
                  const strength = strengthByCounterparty.get(theirs.party.id);
                  return (
                    <li id={`match-${m.id}`} className="scroll-mt-4 rounded-card border border-border bg-card p-4" key={m.id}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-subtle-fg">
                            <span>{MATCH_STATUS_LABEL[m.status] ?? m.status}</span>
                            {(yours.urgent || theirs.urgent) && <Badge tone="warning">Time-sensitive</Badge>}
                            {strength && strength >= 2 && (
                              <Badge tone="info">Preferred partner · {strength} completed</Badge>
                            )}
                            <span>{CONFIDENCE_LABEL[ranked.confidence]}</span>
                          </div>
                          <p className="mt-1 font-medium">Yours: {yours.title}</p>
                          <MatchCounterpart
                            post={theirs}
                            myDistrict={party.district}
                            myProvince={party.province}
                            countryCode={party.countryCode}
                          />
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
                            <p className="mt-2 text-sm text-muted-fg">
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
                            <p className="mt-1 text-xs text-subtle-fg">
                              Ranked {ranked.rank} · {ranked.rationale.join(" · ")}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 sm:shrink-0 sm:flex-col sm:items-end">
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
                            <p className="text-sm text-muted-fg">
                              You reported: {OUTCOME_LABEL[myConfirmation.outcome].toLowerCase()}.
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
              <p className="text-xs text-subtle-fg">
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
                  className="rounded-card border border-border bg-card px-4 py-2 text-sm text-muted-fg"
                >
                  {yours.title} ↔ {theirs.party.name} ({theirs.title}) ·{" "}
                  {myConfirmation ? OUTCOME_LABEL[myConfirmation.outcome] : "Not confirmed"}
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
  countryCode,
}: {
  post: CounterpartPost;
  myDistrict: string;
  myProvince: string;
  countryCode: string;
}) {
  const reputation = summarizeReputation(post.party.reputation);
  const estimatedValue = estimatedIntentValue(post);

  return (
    <div className="mt-1">
      <p className="text-sm text-muted-fg">
        {post.party.name} {post.side === "SUPPLY" ? "has" : "needs"}: {post.title}
        {post.recurring && (
          <Badge tone="info" className="ml-2">
            Standing order
          </Badge>
        )}
      </p>
      <p className="text-xs text-subtle-fg">
        {reputation.headline}
        {reputation.hasHistory && ` · ${reputation.completedLine}`} ·{" "}
        {distanceLabel(post.district, post.province, myDistrict, myProvince)}
        {estimatedValue != null &&
          ` · Est. value ${formatMoney(estimatedValue, regionFor(countryCode))}`}
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
              className="h-16 w-16 rounded-control object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );
}

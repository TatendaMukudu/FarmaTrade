import Link from "next/link";
import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { respondToMatch } from "./actions";
import { ConfirmForm } from "./confirm-form";
import { summarizeReputation } from "@/lib/reputation";
import { pilotVisibleReason } from "@/lib/reputation-core";
import {
  resolveMatchSides,
  groupMatchesByOwnIntent,
  combinedOfferedQuantity,
  distanceLabel,
  estimatedIntentValue,
} from "@/lib/match-view";
import { loadMatchingHistory, toRankableMatch } from "@/lib/match-ranking";
import { planMatches, type Bucket } from "@/lib/match-rank";
import {
  awaitingFrom,
  governingTerms,
  openTerms,
  viewFor,
  type EngagementView,
  type Participants,
} from "@/lib/agreement-core";
import { toTermsVersions } from "@/lib/agreement-view";
import { basisOf, loadCapacities } from "@/lib/allocation";
import { pairwiseQuantity } from "@/lib/capacity";
import { formatMoneyAmount } from "@/lib/money";
import { formatQuantity, pluralizeUnit } from "@/lib/units";
import { formatCanonical } from "@/lib/measurement";
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

// Where an engagement has got to, said as coordination between two people
// rather than as steps in a checkout. "Waiting for them" is the sentence a
// farmer actually wants; "ACCEPTED" was never one.
//
// The one that matters most is that a single party clicking accept now
// reads as waiting, not as agreed — the page must not imply a trade is
// settled because one side said yes.
const ENGAGEMENT_LABEL: Record<EngagementView, string> = {
  suggested: "Suggested",
  waiting_for_you: "They are waiting on you",
  waiting_for_them: "Waiting for them",
  agreed: "Agreed",
  renegotiating: "Agreed \u2014 new terms proposed",
  completed: "Completed",
  closed: "Closed",
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
        status: { in: ["SUGGESTED", "NEGOTIATING", "AGREED", "ACCEPTED"] },
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
        terms: { include: { acceptances: { select: { partyId: true } } } },
      },
      orderBy: { score: "desc" },
    }),
    prisma.match.findMany({
      where: {
        AND: [
          { OR: [{ status: "COMPLETED" }, { cancellation: { isNot: null } }] },
          { OR: [{ intentA: { partyId: party.id } }, { intentB: { partyId: party.id } }] },
        ],
      },
      include: {
        intentA: { include: { party: true } },
        intentB: { include: { party: true } },
        confirmations: true,
        cancellation: { include: { cancelledBy: { select: { name: true } } } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.relation.findMany({
      where: { OR: [{ partyAId: party.id }, { partyBId: party.id }] },
    }),
    loadMatchingHistory(),
  ]);

  // What every intent on this page still has available. Loaded once for
  // both sides of every match, because "how much is left" is the question
  // this page is really answering and asking it per card would be a query
  // per row.
  const capacities = await loadCapacities([
    ...new Set(active.flatMap((m) => [m.intentAId, m.intentBId])),
  ]);
  const remainingOf = (intent: { id: string }) => capacities.get(intent.id)?.remaining ?? null;

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
      // What is still outstanding on this order, not what was originally
      // asked for — a buyer who has already agreed 70 of 100 tonnes wants to
      // see the 30.
      outstanding: capacities.get(g.yours.id)?.remaining ?? g.yours.quantity ?? 0,
      combined: combinedOfferedQuantity<CounterpartPost, (typeof active)[number]>(
        g.matches,
        party.id,
        remainingOf,
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
          action={{ href: "/dashboard/trade", label: "Add supply or a need" }}
        />
      )}

      {coverage.length > 0 && (
        <div className="flex flex-col gap-3">
          {coverage.map(({ yours, count, outstanding, combined }) => (
            <div key={yours.id} className="rounded-card border border-border bg-new-bg p-3">
              <p className="text-sm font-medium text-new-fg">
                Still available for &ldquo;{yours.title}&rdquo;:{" "}
                {combined.total.toLocaleString()} / {outstanding.toLocaleString()}{" "}
                {yours.unit ? pluralizeUnit(yours.unit, outstanding) : ""} across {count} matches
              </p>
              {combined.unbounded > 0 && (
                <p className="mt-1 text-xs text-subtle-fg">
                  {combined.unbounded} of them did not say how much, so this total is the
                  part FarmaTrade can count.
                </p>
              )}
              <div className="mt-2 h-2 w-full overflow-hidden rounded-pill bg-border">
                <div
                  className="h-full bg-accent"
                  style={{
                    width: `${outstanding > 0 ? Math.min(100, (combined.total / outstanding) * 100) : 100}%`,
                  }}
                />
              </div>
            </div>
          ))}
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
                  const yoursRemaining = remainingOf(yours);
                  // The most this engagement could be for, shown before the
                  // farmer agrees to it rather than discovered afterwards.
                  // Null where the two sides' units cannot be compared or
                  // neither named a quantity — in which case accepting
                  // records the engagement without a number, because
                  // FarmaTrade has no honest one to record.
                  const supplySide = yours.side === "SUPPLY" ? yours : theirs;
                  const demandSide = yours.side === "SUPPLY" ? theirs : yours;
                  // Across units now: a supplier with 2 tonnes and a buyer
                  // needing 500 kg meet at 500 kg. Null where the two sides
                  // cannot be brought together at all — bags against
                  // tonnes — in which case the button says nothing about
                  // amounts rather than inventing one.
                  const upTo = pairwiseQuantity(
                    { remaining: remainingOf(supplySide), basis: basisOf(capacities.get(supplySide.id)) },
                    { remaining: remainingOf(demandSide), basis: basisOf(capacities.get(demandSide.id)) },
                  );
                  const versions = toTermsVersions(m.terms);
                  const participants: Participants = [yours.partyId, theirs.partyId];
                  const view = viewFor({ status: m.status, versions }, participants, party.id);
                  const governing = governingTerms(versions, participants);
                  const open = openTerms(versions, participants);
                  // Whose move it is, from the rows rather than from the
                  // status. One party having accepted is not agreement, and
                  // the page must never round it up to one.
                  const yourMove = open != null && awaitingFrom(open, participants).includes(party.id);
                  return (
                    <li id={`match-${m.id}`} className="scroll-mt-4 rounded-card border border-border bg-card p-4" key={m.id}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-subtle-fg">
                            <span>{ENGAGEMENT_LABEL[view]}</span>
                            {(yours.urgent || theirs.urgent) && <Badge tone="warning">Time-sensitive</Badge>}
                            {strength && strength >= 2 && (
                              <Badge tone="info">Preferred partner · {strength} completed</Badge>
                            )}
                            <span>{CONFIDENCE_LABEL[ranked.confidence]}</span>
                          </div>
                          <p className="mt-1 font-medium">Yours: {yours.title}</p>
                          {/* What is actually left to trade under this
                              intent, which is not the same as what it
                              originally offered once part of it is agreed
                              elsewhere. Absent where the owner never stated
                              a quantity — there is no ceiling to report. */}
                          {yoursRemaining != null && yours.quantity != null && (
                            <p className="text-xs text-subtle-fg">
                              {(() => {
                                const basis = basisOf(capacities.get(yours.id));
                                const authorized = capacities.get(yours.id)?.authorized ?? yours.quantity;
                                return basis
                                  ? `${formatCanonical(yoursRemaining, basis)} of ${formatCanonical(authorized, basis)}`
                                  : `${formatQuantity(yoursRemaining, yours.unit)} of ${formatQuantity(yours.quantity, yours.unit)}`;
                              })()}{" "}
                              still available
                            </p>
                          )}
                          <MatchCounterpart
                            post={theirs}
                            myDistrict={party.district}
                            myProvince={party.province}
                          />
                          {m.reasons.length > 0 && (
                            <p className="mt-2 text-sm font-medium text-foreground">
                              Why: <span className="font-normal">{m.reasons.map(pilotVisibleReason).join(" · ")}</span>
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
                          {governing?.quantity != null && (
                            <span className="text-xs whitespace-nowrap text-subtle-fg">
                              Agreed: {formatQuantity(governing.quantity, governing.unit)}
                            </span>
                          )}
                          {/* Terms somebody is waiting on an answer to.
                              Shown with the number attached, because
                              agreeing to "it" without seeing what "it" is
                              is not consent to anything. */}
                          {open?.quantity != null && (
                            <span className="text-xs whitespace-nowrap text-subtle-fg">
                              {yourMove ? "They propose" : "You proposed"}:{" "}
                              {formatQuantity(open.quantity, open.unit)}
                            </span>
                          )}
                          {(m.status === "SUGGESTED" || yourMove) && (
                            <form action={respondToMatch} className="flex gap-2">
                              <input type="hidden" name="id" value={m.id} />
                              {open && <input type="hidden" name="version" value={open.version} />}
                              <button type="submit" name="decision" value="ACCEPTED" className={SOLID_BUTTON}>
                                {/* Says what it does. Agreeing when the
                                    other side already has is what settles
                                    the trade; going first only records
                                    where you stand. */}
                                {open
                                  ? `Agree to ${open.quantity != null ? formatQuantity(open.quantity, open.unit) : "these terms"}`
                                  : upTo != null
                                    ? `Offer ${upTo.unit ? formatCanonical(upTo.value, upTo.unit) : formatQuantity(upTo.value, yours.unit ?? theirs.unit)}`
                                    : "I am interested"}
                              </button>
                              <button type="submit" name="decision" value="DECLINED" className={OUTLINE_BUTTON}>
                                Decline
                              </button>
                            </form>
                          )}
                          {open != null && !yourMove && (
                            <span className="text-xs whitespace-nowrap text-subtle-fg">
                              Waiting for {theirs.party.name}
                            </span>
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
                      {(view === "agreed" || view === "renegotiating") && (
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
                  {m.cancellation
                    ? `Cancelled by ${m.cancellation.cancelledBy.name} on ${m.cancellation.createdAt.toLocaleDateString("en-GB")}`
                    : myConfirmation
                      ? OUTCOME_LABEL[myConfirmation.outcome]
                      : "Not confirmed"}
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
  // A value only where the price says enough to have one. A legacy price
  // with no recorded basis shows nothing rather than a number that is wrong
  // half the time.
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
        {estimatedValue.ok && ` · Est. value ${formatMoneyAmount(estimatedValue.total)}`}
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

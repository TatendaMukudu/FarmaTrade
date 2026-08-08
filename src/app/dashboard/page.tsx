import Link from "next/link";
import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureHarvestDrafts } from "@/lib/harvest-drafts";
import { summarizeReputation } from "@/lib/reputation";
import { resolveMatchSides } from "@/lib/match-view";
import { loadMatchingHistory, toRankableMatch } from "@/lib/match-ranking";
import { rankMatches } from "@/lib/match-rank";
import {
  CategoryIcon,
  ListingIcon,
  LocationIcon,
  MatchIcon,
  ProduceIcon,
  SproutIcon,
  StarIcon,
} from "@/components/icons";
import { regionFor } from "@/lib/regions";
import { pluralizeUnit } from "@/lib/units";
import { loadPendingStamps, loadPriceSignals, stampBanner } from "@/lib/confirmations";
import { promptsWorthSurfacing } from "@/lib/confirmations-core";
import { signalForSubject } from "@/lib/price-signals";
import { Badge } from "@/components/badge";
import { Card, EmptyState, LinkCard, SectionHeading, StatTile, buttonClass } from "@/components/ui";
import type { Post, Party } from "@/generated/prisma/client";

// How many recent suggestions the overview ranks before taking the top few.
// Wide enough that ranking has a real choice to make, narrow enough that the
// overview stays one small query.
const TOP_MATCH_CANDIDATES = 40;
const TOP_MATCHES_SHOWN = 3;

// "Good morning" should mean morning where the farmer is. Judged against
// their own region's timezone rather than the pilot's or the server's.
function greeting(timeZone: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const party = await getCurrentParty();
  if (!party) return null;

  if (party.farm) {
    await ensureHarvestDrafts(party.farm.id, party);
  }

  // Captured before we stamp "now" below, so this render still shows what's
  // new since the *previous* visit rather than immediately zeroing itself out.
  const since = party.opportunitiesLastSeenAt;

  const [
    openPostCount,
    opportunityCount,
    newSinceLastVisit,
    draftCount,
    matchCandidates,
    topProduce,
    matchingHistory,
    pending,
    priceSignals,
  ] = await Promise.all([
      prisma.post.count({ where: { partyId: party.id, status: "OPEN" } }),
      prisma.match.count({
        where: {
          status: "SUGGESTED",
          OR: [{ postA: { partyId: party.id } }, { postB: { partyId: party.id } }],
        },
      }),
      prisma.match.count({
        where: {
          status: "SUGGESTED",
          createdAt: since ? { gt: since } : undefined,
          OR: [{ postA: { partyId: party.id } }, { postB: { partyId: party.id } }],
        },
      }),
      party.farm
        ? prisma.post.count({ where: { partyId: party.id, status: "DRAFT" } })
        : Promise.resolve(0),
      // Fetched unsorted-by-score and ranked in memory: `Match.score` is
      // what was true the day the match was written, so ordering on it here
      // would show a stale top three. Bounded by a recency window rather
      // than `take: 3` — read-time ranking needs candidates to choose from.
      prisma.match.findMany({
        where: {
          status: "SUGGESTED",
          OR: [{ postA: { partyId: party.id } }, { postB: { partyId: party.id } }],
        },
        include: {
          postA: { include: { party: { include: { reputation: true } } } },
          postB: { include: { party: { include: { reputation: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: TOP_MATCH_CANDIDATES,
      }),
      party.farm
        ? prisma.produceStock.findFirst({
            where: { farmId: party.farm.id, quantity: { gt: 0 } },
            orderBy: { quantity: "desc" },
          })
        : Promise.resolve(null),
    loadMatchingHistory(),
    loadPendingStamps(party.id),
    loadPriceSignals(party),
  ]);

  await prisma.party.update({
    where: { id: party.id },
    data: { opportunitiesLastSeenAt: new Date() },
  });

  const region = regionFor(party.countryCode);
  const reputation = summarizeReputation(party.reputation);
  const banner = stampBanner(pending);
  const toStamp = promptsWorthSurfacing(pending);
  // The one price line most worth this farmer's attention: whatever they
  // actually have the most of on the market right now.
  const priceLine = topProduce
    ? signalForSubject(priceSignals, topProduce.cropType, party.district) ?? priceSignals[0] ?? null
    : priceSignals[0] ?? null;
  const topMatches = rankMatches(
    matchCandidates.map((m) => toRankableMatch(m, party.id)),
    matchingHistory,
  ).slice(0, TOP_MATCHES_SHOWN);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">
          {greeting(region.timeZone)}, {party.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-fg">
          {party.farm ? party.farm.farmName : `${party.district}, ${party.province}`}
        </p>
      </div>

      {/* Stamping leads the page when something is owed. Every learning
          signal FarmaTrade has runs through these confirmations, and a
          farmer's own track record is empty until they file them — so this
          sits above matches rather than below. */}
      {banner && (
        <div
          className={`rounded-card border border-border p-4 ${
            banner.tone === "warning" ? "bg-warning-bg" : "bg-new-bg"
          }`}
        >
          <p
            className={`text-sm font-medium ${
              banner.tone === "warning" ? "text-warning-fg" : "text-new-fg"
            }`}
          >
            {banner.headline}
          </p>
          <p className="mt-1 text-sm text-muted-fg">{banner.reason}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {toStamp.slice(0, 3).map((prompt) => (
              <li
                key={prompt.matchId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-card px-3 py-2"
              >
                <span className="text-sm">
                  {prompt.title} · with {prompt.counterpartyName}
                  <span className="text-subtle-fg">
                    {" "}
                    · agreed {prompt.ageDays === 0 ? "today" : `${prompt.ageDays}d ago`}
                  </span>
                </span>
                <Link
                  href={`/dashboard/opportunities#match-${prompt.matchId}`}
                  className={buttonClass("primary", "sm")}
                >
                  Confirm
                </Link>
              </li>
            ))}
          </ul>
          {toStamp.length > 3 && (
            <p className="mt-2 text-sm text-muted-fg">
              and {toStamp.length - 3} more on Opportunities.
            </p>
          )}
        </div>
      )}

      {draftCount > 0 && (
        <Link
          href="/dashboard/posts"
          className="rounded-card border border-border bg-warning-bg p-4 text-sm font-medium text-warning-fg hover:opacity-90"
        >
          {draftCount} listing{draftCount === 1 ? "" : "s"} drafted from your upcoming
          harvest — confirm to publish
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<MatchIcon />}
          value={String(since && newSinceLastVisit > 0 ? newSinceLastVisit : opportunityCount)}
          label={
            since && newSinceLastVisit > 0
              ? `new match${newSinceLastVisit === 1 ? "" : "es"} since your last visit`
              : `open match${opportunityCount === 1 ? "" : "es"}`
          }
          href="/dashboard/opportunities"
        />
        <StatTile
          icon={<ListingIcon />}
          value={String(openPostCount)}
          label={`active listing${openPostCount === 1 ? "" : "s"}`}
          href="/dashboard/posts"
        />
        <StatTile
          icon={<StarIcon />}
          value={reputation.hasHistory ? reputation.headline.replace("★", "").trim() : "—"}
          label={reputation.hasHistory ? reputation.completedLine : "no trade history yet"}
        />
        {topProduce ? (
          <StatTile
            icon={<ProduceIcon />}
            value={`${topProduce.quantity}`}
            label={`${pluralizeUnit(topProduce.unit, topProduce.quantity)} of ${topProduce.cropType}${topProduce.perishable ? " ready" : ""}`}
            href="/dashboard/farm"
          />
        ) : (
          <StatTile
            icon={<LocationIcon />}
            value={party.district}
            label={party.province}
          />
        )}
      </div>

      {/* Asking prices near this farmer. A range, never a single figure --
          a median dressed up as "the price" invites treating it as a
          valuation, and it is not one. */}
      {priceLine && (
        <Card>
          <p className="text-sm font-medium">{priceLine.line}</p>
          <p className="mt-1 text-sm text-muted-fg">
            Asking prices from listings in your province over the last 30 days. FarmaTrade
            has no way to see what things actually sold for.
          </p>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <SectionHeading
          title="Today's opportunities"
          action={{ href: "/dashboard/opportunities", label: "See all" }}
        />
        {topMatches.length === 0 ? (
          <EmptyState
            icon={<SproutIcon />}
            title="No opportunities yet"
            hint="Post what you have or what you need, and FarmaTrade matches it against the opposite side."
            action={{ href: "/dashboard/posts", label: "Create a post" }}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {topMatches.map(({ match }) => {
              const m = match.source;
              const { theirs } = resolveMatchSides(m, party.id);
              const isNew = since ? m.createdAt > since : true;
              return (
                <li key={m.id}>
                  <LinkCard href={`/dashboard/conversations/${m.id}`}>
                    <span className="text-sm">
                      <OpportunityLine post={theirs} isNew={isNew} />
                    </span>
                  </LinkCard>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          <QuickAction
            href="/dashboard/posts?type=HAVE&category=PRODUCE"
            icon={<ProduceIcon />}
            label="Sell produce"
          />
          <QuickAction
            href="/dashboard/posts?type=NEED&category=TRANSPORT"
            icon={<CategoryIcon category="TRANSPORT" />}
            label="Need transport"
          />
          <QuickAction
            href="/dashboard/posts?type=NEED&category=EQUIPMENT"
            icon={<CategoryIcon category="EQUIPMENT" />}
            label="Borrow equipment"
          />
          <QuickAction
            href="/dashboard/posts?type=NEED&category=INPUTS"
            icon={<CategoryIcon category="INPUTS" />}
            label="Need supplies"
          />
        </div>
      </div>
    </div>
  );
}

function OpportunityLine({ post, isNew }: { post: Post & { party: Party }; isNew: boolean }) {
  return (
    <span>
      <CategoryIcon category={post.category} className="inline-block align-text-bottom" />{" "}
      {post.party.name} {post.type === "HAVE" ? "has" : "wants"}:{" "}
      {post.title}
      {isNew && (
        <Badge tone="success" className="ml-2">
          New
        </Badge>
      )}
    </span>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-control border border-border px-4 py-2 text-sm font-medium hover:bg-new-bg"
    >
      {icon}
      {label}
    </Link>
  );
}

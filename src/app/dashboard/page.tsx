import Link from "next/link";
import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureHarvestDrafts } from "@/lib/harvest-drafts";
import { summarizeReputation } from "@/lib/reputation";
import { resolveMatchSides } from "@/lib/match-view";
import { categoryEmoji } from "@/lib/categories";
import { Badge } from "@/components/badge";
import type { Post, Party } from "@/generated/prisma/client";

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Harare",
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

  const [openPostCount, opportunityCount, newSinceLastVisit, draftCount, topMatches, topProduce] =
    await Promise.all([
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
      prisma.match.findMany({
        where: {
          status: "SUGGESTED",
          OR: [{ postA: { partyId: party.id } }, { postB: { partyId: party.id } }],
        },
        include: {
          postA: { include: { party: true } },
          postB: { include: { party: true } },
        },
        orderBy: { score: "desc" },
        take: 3,
      }),
      party.farm
        ? prisma.produceStock.findFirst({
            where: { farmId: party.farm.id, quantity: { gt: 0 } },
            orderBy: { quantity: "desc" },
          })
        : Promise.resolve(null),
    ]);

  await prisma.party.update({
    where: { id: party.id },
    data: { opportunitiesLastSeenAt: new Date() },
  });

  const reputation = summarizeReputation(party.reputation);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">
          {greeting()}, {party.name.split(" ")[0]} 👋
        </h1>
        <p className="text-sm text-gray-500">
          {party.farm ? party.farm.farmName : `${party.district}, ${party.province}`}
        </p>
      </div>

      {draftCount > 0 && (
        <Link
          href="/dashboard/posts"
          className="rounded-lg border border-border bg-warning-bg p-3 text-sm font-medium text-warning-fg hover:opacity-90"
        >
          🌾 {draftCount} listing{draftCount === 1 ? "" : "s"} drafted from your upcoming
          harvest — confirm to publish →
        </Link>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {topProduce && (
          <StatLine
            emoji={categoryEmoji("PRODUCE")}
            text={`${topProduce.quantity} ${topProduce.unit.toLowerCase()} of ${topProduce.cropType}${
              topProduce.perishable ? " ready" : ""
            }`}
          />
        )}
        <StatLine
          emoji="🤝"
          text={
            since && newSinceLastVisit > 0
              ? `${newSinceLastVisit} new match${newSinceLastVisit === 1 ? "" : "es"} since your last visit`
              : opportunityCount > 0
                ? `${opportunityCount} open match${opportunityCount === 1 ? "" : "es"}`
                : "No new matches yet"
          }
        />
        <StatLine
          emoji="📦"
          text={`${openPostCount} active listing${openPostCount === 1 ? "" : "s"}`}
        />
        <StatLine
          emoji="⭐"
          text={
            reputation.hasHistory
              ? `Reputation ${reputation.headline} · ${reputation.completedLine}`
              : "No trade history yet"
          }
        />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Today&rsquo;s opportunities</h2>
          <Link href="/dashboard/opportunities" className="text-sm text-gray-500 underline">
            See all
          </Link>
        </div>
        <ul className="flex flex-col gap-2">
          {topMatches.map((m) => {
            const { theirs } = resolveMatchSides(m, party.id);
            const isNew = since ? m.createdAt > since : true;
            return (
              <li key={m.id} className="rounded border p-3 text-sm">
                <OpportunityLine post={theirs} isNew={isNew} />
              </li>
            );
          })}
          {topMatches.length === 0 && (
            <li className="text-sm text-gray-400">
              No opportunities yet — post what you have or need to get matched.
            </li>
          )}
        </ul>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          <QuickAction
            href="/dashboard/posts?type=HAVE&category=PRODUCE"
            emoji={categoryEmoji("PRODUCE")}
            label="Sell produce"
          />
          <QuickAction
            href="/dashboard/posts?type=NEED&category=TRANSPORT"
            emoji={categoryEmoji("TRANSPORT")}
            label="Need transport"
          />
          <QuickAction
            href="/dashboard/posts?type=NEED&category=EQUIPMENT"
            emoji={categoryEmoji("EQUIPMENT")}
            label="Borrow equipment"
          />
          <QuickAction
            href="/dashboard/posts?type=NEED&category=INPUTS"
            emoji={categoryEmoji("INPUTS")}
            label="Need supplies"
          />
        </div>
      </div>
    </div>
  );
}

function StatLine({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-new-bg text-lg">
        {emoji}
      </span>
      <span className="text-right text-sm">{text}</span>
    </div>
  );
}

function OpportunityLine({ post, isNew }: { post: Post & { party: Party }; isNew: boolean }) {
  return (
    <span>
      {categoryEmoji(post.category)} {post.party.name} {post.type === "HAVE" ? "has" : "wants"}:{" "}
      {post.title}
      {isNew && (
        <Badge tone="success" className="ml-2">
          New
        </Badge>
      )}
    </span>
  );
}

function QuickAction({ href, emoji, label }: { href: string; emoji: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded border px-4 py-2 text-sm font-medium hover:bg-gray-50"
    >
      <span>{emoji}</span>
      {label}
    </Link>
  );
}

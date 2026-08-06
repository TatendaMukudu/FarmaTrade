import Link from "next/link";
import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

const CATEGORY_EMOJI: Record<string, string> = {
  LIVESTOCK: "🐄",
  PRODUCE: "🍊",
  EQUIPMENT: "🚜",
  TRANSPORT: "🚛",
};

export default async function DashboardPage() {
  const party = await getCurrentParty();
  if (!party) return null;

  const [openPostCount, opportunityCount, topMatches, topProduce] = await Promise.all([
    prisma.post.count({ where: { partyId: party.id, status: "OPEN" } }),
    prisma.match.count({
      where: {
        status: "SUGGESTED",
        OR: [{ postA: { partyId: party.id } }, { postB: { partyId: party.id } }],
      },
    }),
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

  const reputation = party.reputation;
  const hasRating = reputation && reputation.ratingCount > 0;

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {topProduce && (
          <StatLine
            emoji={CATEGORY_EMOJI.PRODUCE}
            text={`${topProduce.quantity} ${topProduce.unit.toLowerCase()} of ${topProduce.cropType}${
              topProduce.perishable ? " ready" : ""
            }`}
          />
        )}
        <StatLine
          emoji="🤝"
          text={
            opportunityCount > 0
              ? `${opportunityCount} new match${opportunityCount === 1 ? "" : "es"} found`
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
            hasRating
              ? `Reputation ${reputation!.averageRating!.toFixed(1)} · ${reputation!.completedCount} completed`
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
            const theirs = m.postA.partyId === party.id ? m.postB : m.postA;
            return (
              <li key={m.id} className="rounded border p-3 text-sm">
                <OpportunityLine post={theirs} />
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
          <QuickAction href="/dashboard/posts?type=HAVE&category=PRODUCE" emoji="🍊" label="Sell produce" />
          <QuickAction href="/dashboard/posts?type=NEED&category=TRANSPORT" emoji="🚛" label="Need transport" />
          <QuickAction href="/dashboard/posts?type=NEED&category=EQUIPMENT" emoji="🚜" label="Borrow equipment" />
        </div>
      </div>
    </div>
  );
}

function StatLine({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded border p-3">
      <span className="text-xl">{emoji}</span>
      <span className="text-sm">{text}</span>
    </div>
  );
}

function OpportunityLine({ post }: { post: Post & { party: Party } }) {
  const emoji = CATEGORY_EMOJI[post.category] ?? "📌";
  return (
    <span>
      {emoji} {post.party.name} {post.type === "HAVE" ? "has" : "wants"}: {post.title}
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

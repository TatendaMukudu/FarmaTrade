import Link from "next/link";
import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const party = await getCurrentParty();
  if (!party) return null;

  const [openPostCount, opportunityCount] = await Promise.all([
    prisma.post.count({ where: { partyId: party.id, status: "OPEN" } }),
    prisma.match.count({
      where: {
        status: "SUGGESTED",
        OR: [{ postA: { partyId: party.id } }, { postB: { partyId: party.id } }],
      },
    }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {party.name}</h1>
        <p className="text-sm text-gray-500">
          {party.roles.join(", ")} · {party.district}, {party.province}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {party.farm && (
          <Card
            title="Farm"
            href="/dashboard/farm"
            body={party.farm.farmName}
          />
        )}
        <Card
          title="Open posts"
          href="/dashboard/posts"
          body={`${openPostCount} open`}
        />
        <Card
          title="Opportunities"
          href="/dashboard/opportunities"
          body={
            opportunityCount > 0
              ? `${opportunityCount} new match${opportunityCount === 1 ? "" : "es"}`
              : "No new matches"
          }
        />
      </div>
    </div>
  );
}

function Card({ title, href, body }: { title: string; href: string; body: string }) {
  return (
    <Link href={href} className="rounded border p-4 hover:bg-gray-50">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-1 font-medium">{body}</p>
    </Link>
  );
}

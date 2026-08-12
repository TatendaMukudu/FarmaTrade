import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentParty } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";
import { Sidebar, BottomTabs } from "@/components/dashboard-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const party = await getCurrentParty();
  if (!party) {
    redirect("/login");
  }

  const hasFarm = !!party.farm;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card p-4 md:flex">
        <Link href="/dashboard" className="mb-6 px-3 text-lg font-semibold">
          FarmaTrade
        </Link>
        <Sidebar hasFarm={hasFarm} />
        <div className="mt-auto flex flex-col gap-1 border-t border-border pt-4">
          <Link
            href="/dashboard/settings"
            className="rounded-card px-3 py-2 text-sm text-muted-fg hover:bg-new-bg"
          >
            Settings
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full rounded-card px-3 py-2 text-left text-sm text-muted-fg hover:bg-new-bg"
            >
              Log out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
          <Link href="/dashboard" className="font-semibold">
            FarmaTrade
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/dashboard/settings" className="text-sm text-muted-fg underline">
              Settings
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="text-sm text-muted-fg underline">
                Log out
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8">{children}</main>
      </div>

      <BottomTabs hasFarm={hasFarm} />
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentParty } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const party = await getCurrentParty();
  if (!party) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-semibold">
            FarmaTrade
          </Link>
          <nav className="flex gap-4 text-sm text-gray-600">
            <Link href="/dashboard">Overview</Link>
            {party.farm && <Link href="/dashboard/farm">Farm</Link>}
            <Link href="/dashboard/directory">Directory</Link>
            <Link href="/dashboard/posts">Posts</Link>
            <Link href="/dashboard/opportunities">Opportunities</Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard/settings" className="text-sm text-gray-600 underline">
            Settings
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="text-sm text-gray-600 underline">
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}

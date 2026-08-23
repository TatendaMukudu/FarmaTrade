import Link from "next/link";
import { getCurrentParty } from "@/lib/auth";
import { youEntries, type YouEntryKey } from "@/lib/you-hub";
import { FarmIcon, NetworkIcon, SettingsIcon, StarIcon } from "@/components/icons";

const ENTRY_ICON: Record<YouEntryKey, (props: { className?: string }) => React.JSX.Element> = {
  farm: FarmIcon,
  record: StarIcon,
  profile: NetworkIcon,
  settings: SettingsIcon,
};

export default async function YouPage() {
  const party = await getCurrentParty();
  if (!party) return null;

  const entries = youEntries({ partyId: party.id, hasFarm: !!party.farm });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">You</h1>
        <p className="text-sm text-muted-fg">Your farm, business record and account.</p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {entries.map(({ key, label, description, href }) => {
          const Icon = ENTRY_ICON[key];
          const body = (
            <>
              <Icon className="mt-0.5 text-accent" />
              <span>
                <span className="block font-medium">{label}</span>
                <span className="mt-1 block text-sm text-muted-fg">{description}</span>
              </span>
            </>
          );
          return (
            <li key={key}>
              {href ? (
                <Link
                  href={href}
                  className="flex min-h-24 items-start gap-3 rounded-card border border-border bg-card p-4 hover:border-accent"
                >
                  {body}
                </Link>
              ) : (
                // Not a link on purpose. See you-hub.ts: sending an actor to a
                // route that redirects them away is worse than saying plainly
                // that there is nothing there.
                <div
                  data-unavailable="true"
                  aria-disabled="true"
                  className="flex min-h-24 items-start gap-3 rounded-card border border-dashed border-border bg-card p-4 opacity-70"
                >
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import Link from "next/link";
import { getCurrentParty } from "@/lib/auth";
import { FarmIcon, ListingIcon, NetworkIcon, SettingsIcon, StarIcon } from "@/components/icons";

type HubLink = {
  label: string;
  description: string;
  href: string;
  Icon: (props: { className?: string }) => React.JSX.Element;
};

export default async function YouPage() {
  const party = await getCurrentParty();
  if (!party) return null;

  const links: HubLink[] = [
    {
      label: "Farm",
      description: party.farm
        ? "Keep your produce, livestock and equipment records up to date."
        : "Your farm records will appear here when a farm is added.",
      href: "/dashboard/farm",
      Icon: FarmIcon,
    },
    {
      label: "Trade history",
      description: "Return to current conversations and trades you have completed.",
      href: "/dashboard/opportunities",
      Icon: ListingIcon,
    },
    {
      label: "Commercial record",
      description: "See the business record other FarmaTrade members see.",
      href: `/dashboard/network/${party.id}`,
      Icon: StarIcon,
    },
    {
      label: "Profile",
      description: "Update your name, location and business details.",
      href: "/dashboard/settings#profile",
      Icon: NetworkIcon,
    },
    {
      label: "Settings",
      description: "Manage the details FarmaTrade uses for your account.",
      href: "/dashboard/settings",
      Icon: SettingsIcon,
    },
  ];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">You</h1>
        <p className="text-sm text-muted-fg">Your farm, business record and account.</p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {links.map(({ label, description, href, Icon }) => (
          <li key={label}>
            <Link
              href={href}
              className="flex min-h-24 items-start gap-3 rounded-card border border-border bg-card p-4 hover:border-accent"
            >
              <Icon className="mt-0.5 text-accent" />
              <span>
                <span className="block font-medium">{label}</span>
                <span className="mt-1 block text-sm text-muted-fg">{description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

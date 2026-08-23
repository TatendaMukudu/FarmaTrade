"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  NetworkIcon,
  HomeIcon,
  ListingIcon,
  SettingsIcon,
} from "@/components/icons";
import { PRIMARY_DESTINATIONS, isDestinationActive } from "@/lib/navigation";

// Icons mark a fixed set of destinations for fast recognition on a small
// screen. Every one sits beside its own text label, so the icon is a
// scanning aid rather than the only thing carrying the meaning.
const DESTINATION_ICON = {
  Home: HomeIcon,
  Trade: ListingIcon,
  Network: NetworkIcon,
  You: SettingsIcon,
} satisfies Record<
  (typeof PRIMARY_DESTINATIONS)[number]["label"],
  (props: { className?: string }) => React.JSX.Element
>;

export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {PRIMARY_DESTINATIONS.map((item) => {
        const Icon = DESTINATION_ICON[item.label];
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-card px-3 py-2 text-sm font-medium ${
              isDestinationActive(pathname, item.href)
                ? "bg-accent text-accent-foreground"
                : "text-muted-fg hover:bg-new-bg"
            }`}
          >
            <Icon />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-card md:hidden">
      {PRIMARY_DESTINATIONS.map((item) => {
        const Icon = DESTINATION_ICON[item.label];
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium ${
              isDestinationActive(pathname, item.href) ? "text-accent" : "text-muted-fg"
            }`}
          >
            <Icon />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

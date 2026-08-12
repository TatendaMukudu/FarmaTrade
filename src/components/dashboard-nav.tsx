"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DirectoryIcon,
  FarmIcon,
  HomeIcon,
  ListingIcon,
  MatchIcon,
} from "@/components/icons";

type NavItem = {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => React.JSX.Element;
};

// Icons mark a fixed set of destinations for fast recognition on a small
// screen. Every one sits beside its own text label, so the icon is a
// scanning aid rather than the only thing carrying the meaning.
function navItems(hasFarm: boolean): NavItem[] {
  return [
    { href: "/dashboard", label: "Home", Icon: HomeIcon },
    ...(hasFarm ? [{ href: "/dashboard/farm", label: "Farm", Icon: FarmIcon }] : []),
    { href: "/dashboard/directory", label: "Directory", Icon: DirectoryIcon },
    { href: "/dashboard/posts", label: "Posts", Icon: ListingIcon },
    { href: "/dashboard/opportunities", label: "Opportunities", Icon: MatchIcon },
  ];
}

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

export function Sidebar({ hasFarm }: { hasFarm: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {navItems(hasFarm).map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex items-center gap-3 rounded-card px-3 py-2 text-sm font-medium ${
            isActive(pathname, item.href)
              ? "bg-accent text-accent-foreground"
              : "text-muted-fg hover:bg-new-bg"
          }`}
        >
          <item.Icon />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomTabs({ hasFarm }: { hasFarm: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-card md:hidden">
      {navItems(hasFarm).map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
            isActive(pathname, item.href) ? "text-accent" : "text-muted-fg"
          }`}
        >
          <item.Icon />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; icon: string };

// Emoji here are functional (fast recognition of a fixed set of
// destinations on a small screen), not decoration — same rule as the
// category icons elsewhere in the app.
function navItems(hasFarm: boolean): NavItem[] {
  return [
    { href: "/dashboard", label: "Home", icon: "🏠" },
    ...(hasFarm ? [{ href: "/dashboard/farm", label: "Farm", icon: "🌾" }] : []),
    { href: "/dashboard/directory", label: "Directory", icon: "📇" },
    { href: "/dashboard/posts", label: "Posts", icon: "📮" },
    { href: "/dashboard/opportunities", label: "Opportunities", icon: "🤝" },
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
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
            isActive(pathname, item.href)
              ? "bg-accent text-accent-foreground"
              : "text-gray-600 hover:bg-new-bg"
          }`}
        >
          <span className="text-base">{item.icon}</span>
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
            isActive(pathname, item.href) ? "text-accent" : "text-gray-500"
          }`}
        >
          <span className="text-lg">{item.icon}</span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

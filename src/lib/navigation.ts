export type PrimaryDestination = {
  href: string;
  label: "Home" | "Trade" | "Network" | "You";
  alwaysVisible: boolean;
};

// The product's stable mental model. Keep presentation (including icons) in
// dashboard-nav so this module remains pure and the IA can be proved without
// React, the DOM, a session, or a database.
export const PRIMARY_DESTINATIONS: readonly PrimaryDestination[] = [
  { href: "/dashboard", label: "Home", alwaysVisible: true },
  { href: "/dashboard/trade", label: "Trade", alwaysVisible: true },
  { href: "/dashboard/network", label: "Network", alwaysVisible: true },
  { href: "/dashboard/you", label: "You", alwaysVisible: true },
];

export function isDestinationActive(pathname: string, href: string): boolean {
  return href === "/dashboard"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export type DestinationLabel = "Home" | "Trade" | "Network" | "You";

export type PrimaryDestination = {
  href: string;
  label: DestinationLabel;
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

// Which deep routes belong to which destination. Founder ruling, 2026-08-21,
// recorded with its rationale in
// docs/specs/V1-CHECKPOINT-2-information-architecture.md Amendment 1.
//
// Ownership is DECLARED rather than inferred from the URL, because the ruling
// is not derivable from path shape: Home owns /dashboard/opportunities, and
// You owns /dashboard/farm and /dashboard/settings, none of which sit under
// the owning destination's own href.
//
// Opportunities are surfaced BY FarmaTrade TO the actor, which is why they
// belong to Home rather than to Trade — and they are emphatically not trade
// history. A live bilateral trade room is the actor's own commerce, so it
// orients within Trade.
const OWNED_ROUTES: Record<DestinationLabel, readonly string[]> = {
  Home: ["/dashboard", "/dashboard/opportunities"],
  Trade: ["/dashboard/trade", "/dashboard/conversations"],
  Network: ["/dashboard/network"],
  You: ["/dashboard/you", "/dashboard/farm", "/dashboard/settings"],
};

// "/dashboard" is a prefix of every route in the product. It is the one entry
// that matches exactly and never by prefix; without this, Home would own
// Trade, Network and You as well.
const EXACT_ONLY: ReadonlySet<string> = new Set(["/dashboard"]);

// How specifically this destination claims the route, or null for no claim.
// Returning the matched length lets the caller resolve overlaps by longest
// match, so the answer never depends on declaration order.
function claimLength(pathname: string, label: DestinationLabel): number | null {
  let best: number | null = null;
  for (const owned of OWNED_ROUTES[label]) {
    // The trailing slash is what stops /dashboard/networking claiming Network
    // and /dashboard/trades claiming Trade.
    const hit = EXACT_ONLY.has(owned)
      ? pathname === owned
      : pathname === owned || pathname.startsWith(`${owned}/`);
    if (hit && (best === null || owned.length > best)) best = owned.length;
  }
  return best;
}

// Where the actor is, in terms of the four destinations. Null when no
// destination owns the route — honest rather than guessed, and the route
// ownership test fails if that ever happens to a real dashboard page.
export function activeDestination(pathname: string): DestinationLabel | null {
  let bestLabel: DestinationLabel | null = null;
  let bestLength = -1;
  for (const destination of PRIMARY_DESTINATIONS) {
    const length = claimLength(pathname, destination.label);
    if (length !== null && length > bestLength) {
      bestLength = length;
      bestLabel = destination.label;
    }
  }
  return bestLabel;
}

export function isDestinationActive(pathname: string, href: string): boolean {
  const active = activeDestination(pathname);
  if (active === null) return false;
  return PRIMARY_DESTINATIONS.some((d) => d.href === href && d.label === active);
}

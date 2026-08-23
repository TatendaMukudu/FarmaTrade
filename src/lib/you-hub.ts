// What You offers the actor, decided without React or a database so the rule
// can be proved directly.
//
// The rule that matters here: an entry whose destination would bounce the
// actor somewhere else is not rendered as a link. /dashboard/farm redirects to
// Home for anyone with no farm, and a farm can currently only be created at
// signup, so linking a trader there drops them on Home with no explanation and
// no recovery. The entry states the truth instead.

export type YouEntryKey = "farm" | "record" | "profile" | "settings";

export type YouEntry = {
  key: YouEntryKey;
  label: string;
  description: string;
  // Null means "real, but nowhere legitimate to send you". Rendered
  // non-interactive rather than as a link that fails.
  href: string | null;
};

export function youEntries(actor: { partyId: string; hasFarm: boolean }): YouEntry[] {
  return [
    {
      key: "farm",
      label: "Farm",
      description: actor.hasFarm
        ? "Keep your produce, livestock and equipment records up to date."
        : "No farm attached to this account.",
      href: actor.hasFarm ? "/dashboard/farm" : null,
    },
    // No "Trade history" entry. It previously pointed at
    // /dashboard/opportunities, which is not trade history: an opportunity is
    // what might happen, history is what did. There is no dedicated
    // completed-trade surface yet, so the entry is deferred rather than
    // pointed somewhere wrong.
    {
      key: "record",
      label: "Commercial record",
      description: "See the business record other FarmaTrade members see.",
      href: `/dashboard/network/${actor.partyId}`,
    },
    {
      key: "profile",
      label: "Profile",
      description: "Update your name, location and business details.",
      href: "/dashboard/settings#profile",
    },
    {
      key: "settings",
      label: "Settings",
      description: "Manage the details FarmaTrade uses for your account.",
      href: "/dashboard/settings",
    },
  ];
}

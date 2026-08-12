import Link from "next/link";

// The shared shell pieces every dashboard page builds from.
//
// Before this, each page hand-rolled its own card: `p-3` here, `p-4` there,
// `rounded` next to `rounded-lg`, and four different button class strings
// copy-pasted between files. No single instance was wrong, which is exactly
// why it never got fixed — the mismatch only shows up when two of them sit
// side by side.
//
// Padding lives inside these components rather than in a utility scale on
// purpose. A scale still lets a page pick the wrong step; a component with
// the padding baked in does not.

const CARD_BASE = "rounded-card border border-border bg-card";

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`${CARD_BASE} p-4 ${className}`}>{children}</div>;
}

// A card the whole surface of which is a link — used for anything a farmer
// taps to go somewhere. Rendered as an anchor rather than a div with an
// onClick so it is reachable by keyboard and announced as a link.
export function LinkCard({
  href,
  className = "",
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`${CARD_BASE} block p-4 hover:border-accent ${className}`}>
      {children}
    </Link>
  );
}

// The number first, then what it counts.
//
// The old StatLine rendered an icon and then a full sentence at one size
// ("3 active listings"), right-aligned. It read as prose, so nothing was
// scannable and four stacked looked like a list of notes rather than a
// dashboard.
export function StatTile({
  icon,
  value,
  label,
  href,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  href?: string;
}) {
  const body = (
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-new-bg text-muted-fg"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-2xl leading-none font-semibold">{value}</p>
        <p className="mt-1 text-sm text-muted-fg">{label}</p>
      </div>
    </div>
  );
  return href ? <LinkCard href={href}>{body}</LinkCard> : <Card>{body}</Card>;
}

// An empty section is information, not a void. Given the same weight as a
// filled one so "nothing time-critical right now" reads as an answer rather
// than as something that failed to load.
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-card border border-dashed border-border px-4 py-8 text-center">
      {icon && (
        <span className="inline-flex text-subtle-fg [&>svg]:h-8 [&>svg]:w-8">{icon}</span>
      )}
      <p className="mt-2 text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted-fg">{hint}</p>}
      {action && (
        <Link
          href={action.href}
          className="mt-3 inline-block rounded-control border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent hover:text-accent-foreground"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function SectionHeading({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-lg font-medium">
        {title}
        {count != null && count > 0 && (
          <span className="ml-2 text-sm font-normal text-subtle-fg">{count}</span>
        )}
      </h2>
      {action && (
        <Link href={action.href} className="text-sm text-muted-fg underline">
          {action.label}
        </Link>
      )}
    </div>
  );
}

// Buttons, in one place. `primary` is the accent fill, `secondary` its
// outline, `quiet` a bare bordered control. Sizes exist because a card
// action and a form submit genuinely differ, not so pages can pick freely.
const BUTTON_VARIANT = {
  primary: "bg-accent text-accent-foreground hover:bg-accent-hover",
  secondary:
    "border border-accent text-accent hover:bg-accent hover:text-accent-foreground",
  quiet: "border border-border text-muted-fg hover:bg-new-bg",
} as const;

const BUTTON_SIZE = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
} as const;

export function buttonClass(
  variant: keyof typeof BUTTON_VARIANT = "primary",
  size: keyof typeof BUTTON_SIZE = "sm",
): string {
  return `inline-block rounded-control font-medium disabled:opacity-50 ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]}`;
}

// Shown while a page's data is in flight. FarmaTrade's pages are
// server-rendered, so without this a slow request is a long nothing followed
// by a jump — the layout arriving first makes the wait legible.
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-control bg-new-bg ${className}`}
    />
  );
}

export function SkeletonCard() {
  return (
    <Card>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-3 h-3 w-2/3" />
      <Skeleton className="mt-2 h-3 w-1/2" />
    </Card>
  );
}

// A page-level placeholder. `label` is announced to screen readers, which
// otherwise get silence while the pulse animates.
export function LoadingPage({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-col gap-6" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-7 w-48" />
      <div className="flex flex-col gap-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

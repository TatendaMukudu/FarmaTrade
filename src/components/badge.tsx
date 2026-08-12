const TONE_CLASSES = {
  warning: "bg-warning-bg text-warning-fg",
  info: "bg-info-bg text-info-fg",
  success: "bg-success-bg text-success-fg",
  new: "bg-new-bg text-new-fg",
} as const;

export type BadgeTone = keyof typeof TONE_CLASSES;

// The one place badge styling is defined — every status/trust pill in the
// app (time-sensitive, standing order, preferred partner, verified, new)
// renders through this instead of a hand-copied <span> per page, and every
// tone is a semantic status token, not a raw Tailwind color.
export function Badge({
  tone,
  className = "",
  children,
}: {
  tone: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-block rounded-pill px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

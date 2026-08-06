const TONE_CLASSES = {
  amber: "bg-amber-100 text-amber-800",
  blue: "bg-blue-100 text-blue-800",
  green: "bg-green-100 text-green-800",
} as const;

export type BadgeTone = keyof typeof TONE_CLASSES;

// The one place badge styling is defined — every status/trust pill in the
// app (time-sensitive, standing order, preferred partner, verified, new)
// renders through this instead of a hand-copied <span> per page.
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
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

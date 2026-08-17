import type { CommerceCategory } from "@/generated/prisma/enums";

// Line icons, drawn inline.
//
// These replaced emoji. The case for emoji was that they help a farmer who
// reads slowly — but Zimbabwe is around 95% literate, so that argument was
// mostly imagined, and what emoji actually cost is credibility: a system
// where a smallholder is deciding whether to move twenty tonnes of maize on
// a stranger's word should not look like a chat app.
//
// Inline SVG rather than an icon font or a package: they inherit
// `currentColor` so they follow the theme without a second set of dark-mode
// values, they cost no network request on a rural connection, and they can't
// render as a blank box on an Android build with a stale emoji font — which
// is the failure mode nobody tests for and every user sees.
//
// Deliberately plain. Stroke-only, one weight, no fills, no colour of their
// own. An icon here is a marker for scanning a list, not decoration.

type IconProps = { className?: string };

const BASE = "h-5 w-5 shrink-0";

function Svg({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Decorative: every icon in this app sits beside its own text label,
      // so announcing it again would just be noise in a screen reader.
      aria-hidden="true"
      focusable="false"
      className={`${BASE} ${className}`}
    >
      {children}
    </svg>
  );
}

export function LivestockIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 8c0-1.5 1-2.5 2.5-2.5S9 6.5 9 8" />
      <path d="M20 8c0-1.5-1-2.5-2.5-2.5S15 6.5 15 8" />
      <path d="M6.5 8h11a2 2 0 0 1 2 2v3a5.5 5.5 0 0 1-5.5 5.5h-4A5.5 5.5 0 0 1 4.5 13v-3a2 2 0 0 1 2-2Z" />
      <path d="M10 12.5h.01M14 12.5h.01" />
    </Svg>
  );
}

export function ProduceIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M20 4C11 4 4 8 4 15a5 5 0 0 0 5 5c7 0 11-7 11-16Z" />
      <path d="M4.5 19.5 14 10" />
    </Svg>
  );
}

export function EquipmentIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="7" cy="17" r="3.5" />
      <circle cx="18" cy="17.5" r="2.5" />
      <path d="M7 13.5V8h4l2 5.5" />
      <path d="M11 8h5l1.5 6" />
    </Svg>
  );
}

export function TransportIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M2 7.5h11v9H2z" />
      <path d="M13 11h4l3 3v2.5h-7z" />
      <circle cx="7" cy="18" r="1.8" />
      <circle cx="17.5" cy="18" r="1.8" />
    </Svg>
  );
}

export function InputsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M7 8V6.5a5 5 0 0 1 10 0V8" />
      <path d="M5 8h14l-1 11.5a1.5 1.5 0 0 1-1.5 1.4h-11A1.5 1.5 0 0 1 6 19.5Z" />
    </Svg>
  );
}

export function MatchIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 9h16M16 5l4 4-4 4" />
      <path d="M20 15H4M8 11l-4 4 4 4" />
    </Svg>
  );
}

export function ListingIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5Z" />
      <path d="M4 8.5 12 13l8-4.5M12 13v7" />
    </Svg>
  );
}

export function StarIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m12 4 2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8Z" />
    </Svg>
  );
}

export function LocationIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </Svg>
  );
}

export function SproutIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 21v-8" />
      <path d="M12 13c0-3.3 2.4-6 6-6.5.3 3.6-2.2 6.5-6 6.5Z" />
      <path d="M12 15.5c0-2.8-2-5-5-5.4-.3 3 1.6 5.4 5 5.4Z" />
    </Svg>
  );
}

export function HomeIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z" />
    </Svg>
  );
}

export function DirectoryIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6.5a3 3 0 0 1 0 5.5M17.5 19a5.5 5.5 0 0 0-2-4.2" />
    </Svg>
  );
}

export function FarmIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 20V10l6-4 6 4v10" />
      <path d="M9 20v-5h3v5" />
      <path d="M18 20v-6M18 14c2 0 3-1.2 3-3-2 0-3 1.2-3 3Zm0 0c-2 0-3-1.2-3-3 2 0 3 1.2 3 3Z" />
    </Svg>
  );
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" />
    </Svg>
  );
}

export function LogoutIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M10 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h4" />
      <path d="M15 8.5 18.5 12 15 15.5M18.5 12H9" />
    </Svg>
  );
}

const CATEGORY_ICON: Record<CommerceCategory, (props: IconProps) => React.JSX.Element> = {
  LIVESTOCK: LivestockIcon,
  PRODUCE: ProduceIcon,
  EQUIPMENT: EquipmentIcon,
  TRANSPORT: TransportIcon,
  INPUTS: InputsIcon,
};

export function CategoryIcon({
  category,
  className,
}: {
  category: CommerceCategory;
  className?: string;
}) {
  const Icon = CATEGORY_ICON[category] ?? ListingIcon;
  return <Icon className={className} />;
}

export function legacyDirectoryTarget(segments: readonly string[]): string {
  const partyId = segments.find((segment) => segment.length > 0);
  return partyId
    ? `/dashboard/network/${encodeURIComponent(partyId)}`
    : "/dashboard/network";
}

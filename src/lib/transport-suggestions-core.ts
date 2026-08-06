// Pure predicate, split out from transport-suggestions.ts the same way
// scoreMatch lives in matching-core.ts: no DB, no server-only, directly
// testable, and reusable anywhere a "does this transporter cover this
// route" check is needed — today that's exactly one call site (an accepted
// trade's Conversation page), but the point of pulling it out is that a
// second call site never has to re-derive this logic.
//
// A transporter covers a route if they're based where the goods currently
// are (so they can actually do the pickup) and — if they've said where
// they're headed — that destination lines up with where the goods need to
// go. A transporter with no stated destination isn't ruled out: the post
// form's own default for that field is "Not sure yet", so absence isn't a
// mismatch, it's an open route.
export function transportCoversRoute(
  transportPost: { province: string; destinationProvince: string | null },
  origin: { province: string },
  destination: { province: string },
): boolean {
  if (transportPost.province !== origin.province) return false;
  if (transportPost.destinationProvince == null) return true;
  return transportPost.destinationProvince === destination.province;
}

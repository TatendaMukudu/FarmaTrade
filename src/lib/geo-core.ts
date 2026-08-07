// Real geography, replacing administrative-name equality.
//
// Matching used to qualify candidates with `region: post.region` — an
// exact string compare on an administrative label. That breaks three ways
// at once, and all three are the same bug:
//
//   1. Cross-border trade is impossible by construction. Mutare to Beira is
//      ~290km; Mutare to Bulawayo is ~580km. The old rule matched the far
//      one and could never match the near one, because "Manicaland" is not
//      "Sofala". Zimbabwe/Mozambique/South Africa border trade is real and
//      was structurally unreachable.
//   2. It doesn't survive leaving Zimbabwe. Texas is larger than Zimbabwe,
//      so "same state" is not a proximity filter in the US, and the UK,
//      India and Brazil each slice administrative geography differently.
//   3. It is already wrong domestically. Two farms 5km apart on opposite
//      sides of a provincial boundary never matched.
//
// Distance doesn't care about any of that. Making geography real is the
// same change as making the product international — which is why this
// isn't a localisation file.
//
// Pure and DB-free, same discipline as matching-core.ts.

export type Point = { latitude: number; longitude: number };

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

// Great-circle distance. Haversine rather than a projected approximation
// because southern Africa spans enough latitude for a flat-earth
// approximation to drift, and because it costs nothing to be correct.
export function distanceKm(a: Point, b: Point): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// A latitude/longitude window that contains every point within `radiusKm`.
//
// This exists so the database can do the first cut with an index instead of
// the application loading every post in the world and measuring each one.
// The box is deliberately a superset — it over-selects at the corners — and
// callers refine with distanceKm afterwards. Cheap filter first, exact
// filter second.
export function boundingBox(centre: Point, radiusKm: number) {
  const latDelta = radiusKm / 111.32;
  // Longitude degrees shrink toward the poles. Guarded against the cosine
  // reaching zero at the pole itself, which would ask for an infinite box.
  const cos = Math.cos(toRadians(centre.latitude));
  const lonDelta = radiusKm / (111.32 * Math.max(0.01, Math.abs(cos)));

  return {
    minLatitude: Math.max(-90, centre.latitude - latDelta),
    maxLatitude: Math.min(90, centre.latitude + latDelta),
    minLongitude: centre.longitude - lonDelta,
    maxLongitude: centre.longitude + lonDelta,
  };
}

// How far a party will travel, when they haven't said. Roughly a day's
// round trip on Zimbabwean rural roads with a load — far enough to reach
// the next town and its buyers, short enough that "nearby" still means
// something. Overridable per party via operatingRadiusKm.
export const DEFAULT_OPERATING_RADIUS_KM = 150;

// Transport is the exception, as it was under the old rule: a haulier
// running a route is in the business of covering distance, so their
// catchment is the corridor rather than a circle around home.
export const TRANSPORT_RADIUS_KM = 600;

export type DistanceBand = "same_area" | "nearby" | "regional" | "far";

// Bands rather than raw kilometres for display, because "47.3km" implies a
// precision that region-centroid coordinates don't have. The label a farmer
// needs is "can I get there and back today", not a decimal.
export function distanceBand(km: number): DistanceBand {
  if (km <= 25) return "same_area";
  if (km <= 100) return "nearby";
  if (km <= 400) return "regional";
  return "far";
}

export function distanceLabelFor(km: number, opts: { sameCountry: boolean }): string {
  const rounded = km < 10 ? Math.round(km) : Math.round(km / 5) * 5;
  switch (distanceBand(km)) {
    case "same_area":
      return km <= 5 ? "Right nearby" : `About ${rounded}km away`;
    case "nearby":
      return `About ${rounded}km away`;
    case "regional":
      return opts.sameCountry ? `${rounded}km away` : `${rounded}km away, across the border`;
    case "far":
      return opts.sameCountry ? `${rounded}km away` : `${rounded}km away, international`;
  }
}

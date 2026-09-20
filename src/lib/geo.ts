/**
 * Pure geo math (social-spots.md, "Distance" design decision). No PostGIS
 * on the SQL side either -- `feed_cerca` computes the same haversine
 * formula server-side with the same Earth-radius constant, so this module
 * and the SQL function must agree on both the formula and R (see
 * `geo.test.ts` and `migration-social.test.ts`).
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Mean Earth radius in meters -- must match the SQL side exactly. */
const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two points, in meters, via the haversine formula. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);

  const h =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Human-readable distance: meters (rounded, no decimals) under 1 km, else
 * kilometers with one decimal place. Matches the `distanceAway` copy slot
 * ("{n} de aqui" / "{n} away").
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }

  return `${(meters / 1000).toFixed(1)} km`;
}

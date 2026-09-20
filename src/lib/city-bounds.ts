/** OSM relation 3617877 (Zamboanga City admin boundary) bbox, rounded outward to 2dp. */
export const ZAMBOANGA_CITY_BOUNDS = {
  south: 6.78,
  west: 121.75,
  north: 7.48,
  east: 122.58,
} as const;

/** Same box in Leaflet's [[south, west], [north, east]] literal shape. */
export const ZAMBOANGA_CITY_BOUNDS_LITERAL: [[number, number], [number, number]] = [
  [ZAMBOANGA_CITY_BOUNDS.south, ZAMBOANGA_CITY_BOUNDS.west],
  [ZAMBOANGA_CITY_BOUNDS.north, ZAMBOANGA_CITY_BOUNDS.east],
];

/**
 * Whether a coordinate falls inside the Zamboanga City bounding box,
 * inclusive of all four edges. Pure (no Leaflet import) so it's safe to
 * use from both `validation.ts` (server + client) and `SpotMap.tsx`.
 * `NaN` and +/-Infinity in either coordinate always return `false`.
 */
export function isWithinZamboangaCity(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  return (
    lat >= ZAMBOANGA_CITY_BOUNDS.south &&
    lat <= ZAMBOANGA_CITY_BOUNDS.north &&
    lng >= ZAMBOANGA_CITY_BOUNDS.west &&
    lng <= ZAMBOANGA_CITY_BOUNDS.east
  );
}

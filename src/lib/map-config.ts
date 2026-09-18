/** [lat, lng] center point for the map on first load -- Zamboanga City proper. */
export const ZAMBOANGA_CENTER: [number, number] = [6.9214, 122.079];

/** Zoom level the map opens at. */
export const DEFAULT_ZOOM = 14;

/**
 * Furthest a user can zoom out. Kept at city scale (11) rather than raised:
 * at zoom 11, even a generously wide 2560px browser window only shows
 * about 1.8 degrees of longitude (2560px / (256*2^11 px) * 360deg) --
 * far smaller than Mindanao's own ~7-8 degree width (MINDANAO_BOUNDS), let
 * alone the full Philippines archipelago's ~11 degree span (roughly
 * 116E-127E). Combined with MINDANAO_BOUNDS below, this already makes it
 * geographically impossible to zoom/pan far enough to see the rest of the
 * Philippines or open ocean at any meaningful scale -- see
 * src/__tests__/map-config.mindanao.test.ts for the check.
 */
export const MIN_ZOOM = 11;

/** Furthest a user can zoom in -- OSM tiles get blurry past this. */
export const MAX_ZOOM = 18;

/**
 * Bounding box for the Mindanao island group -- mainland Mindanao plus the
 * Zamboanga Peninsula, Basilan, Sulu, and Tawi-Tawi, which the PSA groups
 * with Mindanao (as opposed to Luzon/Visayas) for the same cultural reason
 * they're relevant here. `[[south, west], [north, east]]`, matching
 * Leaflet's `LatLngBoundsExpression` literal shape.
 *
 * Corners are real named places, not arbitrary rounding:
 * - South (~4.5N): Sibutu/Sitangkai, Tawi-Tawi -- the Philippines'
 *   southernmost inhabited islands, near Borneo.
 * - West (~119.0E): same Sibutu Island area -- Tawi-Tawi's western edge.
 * - North (~9.95N): Siargao / the Surigao del Norte mainland tip, the
 *   northernmost land still part of the Mindanao group.
 * - East (~126.7E): Pusan Point, Governor Generoso, Davao Oriental -- the
 *   easternmost point of the entire Philippines.
 *
 * Used as `maxBounds` on the map so panning/zooming can't drift into the
 * Visayas, Luzon, or open ocean beyond Mindanao's own coastline.
 */
export const MINDANAO_BOUNDS: [[number, number], [number, number]] = [
  [4.5, 119.0],
  [9.95, 126.7],
];

/** Standard OpenStreetMap tile server template. */
export const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

/** Required attribution for OpenStreetMap tiles -- must stay on every map view. */
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

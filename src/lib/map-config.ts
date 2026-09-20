import { ZAMBOANGA_CITY_BOUNDS_LITERAL } from "@/lib/city-bounds";

/** [lat, lng] center point for the map on first load -- Zamboanga City proper. */
export const ZAMBOANGA_CENTER: [number, number] = [6.9214, 122.079];

/** Zoom level the map opens at. */
export const DEFAULT_ZOOM = 14;

/**
 * Furthest a user can zoom out. Kept at city scale (12): at zoom 12, even
 * a generously wide 1920px browser window only shows about 0.66 degrees of
 * longitude (1920px / (256*2^12 px) * 360deg) -- narrower than the
 * Zamboanga City box's own 0.83 degree width (MAX_BOUNDS below), so the
 * clamp never fights the viewport on a normal screen. On wider screens
 * where the viewport *would* exceed the box, Leaflet 1.9 centers the view
 * inside the bounds rather than jittering -- see
 * src/__tests__/map-config.city.test.ts for the check.
 */
export const MIN_ZOOM = 12;

/** Furthest a user can zoom in -- OSM tiles get blurry past this. */
export const MAX_ZOOM = 18;

/**
 * Zamboanga City's own bounding box, re-exported here (from
 * src/lib/city-bounds.ts) as `maxBounds` on the map so panning/zooming
 * can't drift outside the city into open ocean or neighboring provinces.
 */
export const MAX_BOUNDS = ZAMBOANGA_CITY_BOUNDS_LITERAL;

/**
 * Standard OpenStreetMap tile server template -- kept as the raster
 * fallback's contract (Pergamino PRD D6). Used only when the `.pmtiles`
 * basemap archive can't be read.
 */
export const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * Required attribution for OpenStreetMap tiles -- must stay on every map
 * view. Kept as the raster fallback's contract (Pergamino PRD D6).
 */
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * URL of the Zamboanga-only `.pmtiles` vector basemap archive (Pergamino
 * PRD D7). Reads an env var with a local-dev default so the hosting
 * decision (Supabase Storage vs. `public/`) is a dashboard change, not a
 * code change. protomaps-leaflet decides a source is PMTiles by checking
 * that the URL's *pathname* ends in ".pmtiles" -- a query string is fine,
 * but the path itself must end that way.
 */
export const BASEMAP_PMTILES_URL =
  process.env.NEXT_PUBLIC_BASEMAP_PMTILES_URL ?? "/basemap/zamboanga.pmtiles";

/**
 * Highest zoom the `.pmtiles` archive is cut to (Pergamino PRD D9).
 * protomaps-leaflet over-zooms vector geometry past this, so MAX_ZOOM (18)
 * keeps working and lines stay crisp instead of going blurry. If the cut
 * archive exceeds 50MB, re-cut at --maxzoom=14 and drop this to 14 -- see
 * the PRD's Checkpoint section.
 */
export const BASEMAP_MAX_DATA_ZOOM = 15;

/**
 * Attribution for the vector basemap layer -- OpenStreetMap remains the
 * data source (link required), Protomaps built the tiling pipeline.
 */
export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
  '<a href="https://protomaps.com">Protomaps</a>';

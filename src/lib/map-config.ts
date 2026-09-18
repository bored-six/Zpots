/** [lat, lng] center point for the map on first load -- Zamboanga City proper. */
export const ZAMBOANGA_CENTER: [number, number] = [6.9214, 122.079];

/** Zoom level the map opens at. */
export const DEFAULT_ZOOM = 14;

/** Furthest a user can zoom out -- keeps the map focused on the city. */
export const MIN_ZOOM = 11;

/** Furthest a user can zoom in -- OSM tiles get blurry past this. */
export const MAX_ZOOM = 18;

/** Standard OpenStreetMap tile server template. */
export const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

/** Required attribution for OpenStreetMap tiles -- must stay on every map view. */
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

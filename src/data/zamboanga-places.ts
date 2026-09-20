import type { PlaceLabel } from "@/lib/places";

/**
 * The curated list of Zamboanga City place labels drawn on the Pergamino
 * map (.claude/prds/pergamino-map.md, "Place labels" data model). Staged
 * by zoom so a downtown view at z14 shows roughly eight names, and
 * barangays only appear at z15 -- enforced by src/__tests__/places.test.ts
 * rather than by eyeballing.
 *
 * [ASSUMPTION] Coordinates are best-known values, not surveyed. They are
 * checked only for "inside the city outline" (or, for water, "inside the
 * city bounding box") -- see the PRD's Assumptions section, item 2.
 */
export const ZAMBOANGA_PLACES: readonly PlaceLabel[] = [
  { id: "fort-pilar", name: "Fort Pilar", kind: "landmark", lat: 6.9028, lng: 122.0817, minZoom: 13 },
  { id: "paseo-del-mar", name: "Paseo del Mar", kind: "landmark", lat: 6.904, lng: 122.078, minZoom: 14 },
  { id: "plaza-pershing", name: "Plaza Pershing", kind: "landmark", lat: 6.9114, lng: 122.0763, minZoom: 14 },
  { id: "city-hall", name: "City Hall", kind: "landmark", lat: 6.911, lng: 122.0755, minZoom: 15 },
  { id: "pasonanca", name: "Pasonanca", kind: "landmark", lat: 6.944, lng: 122.066, minZoom: 12 },
  { id: "rio-hondo", name: "Rio Hondo", kind: "landmark", lat: 6.901, lng: 122.09, minZoom: 14 },
  { id: "isla-santa-cruz", name: "Isla Santa Cruz", kind: "landmark", lat: 6.883, lng: 122.062, minZoom: 12 },
  { id: "aeropuerto", name: "Aeropuerto", kind: "landmark", lat: 6.9224, lng: 122.0596, minZoom: 13 },
  { id: "puerto", name: "Puerto", kind: "landmark", lat: 6.907, lng: 122.079, minZoom: 14 },
  { id: "canelar", name: "Canelar", kind: "landmark", lat: 6.909, lng: 122.07, minZoom: 15 },
  { id: "ateneo", name: "Ateneo", kind: "landmark", lat: 6.913, lng: 122.071, minZoom: 15 },
  {
    id: "la-vieja-zamboanga",
    name: "Zamboanga",
    kind: "landmark",
    lat: 6.912,
    lng: 122.079,
    minZoom: 12,
    maxZoom: 13,
  },
  { id: "tetuan", name: "Tetuan", kind: "barangay", lat: 6.921, lng: 122.085, minZoom: 15 },
  { id: "santa-maria", name: "Santa María", kind: "barangay", lat: 6.928, lng: 122.07, minZoom: 15 },
  { id: "baliwasan", name: "Baliwasan", kind: "barangay", lat: 6.908, lng: 122.063, minZoom: 15 },
  { id: "guiwan", name: "Guiwan", kind: "barangay", lat: 6.933, lng: 122.09, minZoom: 15 },
  { id: "putik", name: "Putik", kind: "barangay", lat: 6.939, lng: 122.084, minZoom: 15 },
  { id: "tugbungan", name: "Tugbungan", kind: "barangay", lat: 6.935, lng: 122.059, minZoom: 15 },
  {
    id: "mar-de-basilan",
    name: "Mar de Basilán",
    kind: "water",
    lat: 6.86,
    lng: 122.05,
    minZoom: 12,
    maxZoom: 14,
  },
  {
    id: "bahia-zamboanga",
    name: "Bahía de Zamboanga",
    kind: "water",
    lat: 6.893,
    lng: 122.07,
    minZoom: 13,
    maxZoom: 15,
  },
];

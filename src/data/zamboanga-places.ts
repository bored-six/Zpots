import type { PlaceLabel } from "@/lib/places";

/**
 * What used to be a ~20-entry curated list of hand-guessed landmark and
 * barangay coordinates is now down to exactly two: the archive's own
 * `places`/`pois` layers already carry real settlement, district (barangay
 * "macrohood"/"neighbourhood"), street, and POI names -- see
 * `buildLabelRules` in src/components/BasemapLayer.tsx -- and queried
 * directly against `public/basemap/zamboanga.pmtiles` (pmtiles CLI +
 * @mapbox/vector-tile), those names are real: e.g. `places` carries
 * "Baliwasan", "Canelar", "Zone I" (macrohood, min_zoom 11) and "Armor
 * Village" (neighbourhood, min_zoom 13); `pois` carries "Fort Pilar",
 * "Paseo del Mar", "Zamboanga City Hall", "Port of Zamboanga". Every
 * curated landmark and barangay entry duplicated one of those and has been
 * retired in favour of it -- one classification, not two independently
 * drifting ones.
 *
 * What's left is the one gap the same archive query confirmed: no local
 * named strait or bay. The `water` layer only carries ocean-scale names
 * ("Sulu Sea", min_zoom 7, at a point far outside the city view) -- there
 * is no in-view tile equivalent for the Spanish/Chavacano water names
 * Zamboangueños actually use for the water around the city. These two stay
 * as DOM labels for exactly that reason -- see .claude/prds/pergamino-map.md's
 * Change Log for the full before/after.
 */
export const ZAMBOANGA_PLACES: readonly PlaceLabel[] = [
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

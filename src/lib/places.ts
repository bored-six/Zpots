/**
 * Types and visibility logic for the curated place-name labels drawn on the
 * Pergamino map (see .claude/prds/pergamino-map.md, D2). Labels never come
 * from the vector tile data -- `labelRules: []` is passed to
 * protomaps-leaflet -- so the label count and staging are entirely
 * controlled here, by hand, by zoom.
 */

export type PlaceKind = "landmark" | "barangay" | "water";

export interface PlaceLabel {
  /** Stable kebab slug, unique across src/data/zamboanga-places.ts. */
  id: string;
  /** As written -- mixed case. CSS applies the uppercase transform, never the data. */
  name: string;
  kind: PlaceKind;
  lat: number;
  lng: number;
  /** First zoom level the label appears at. */
  minZoom: number;
  /** Last zoom level the label appears at. Omitted means "stays visible". */
  maxZoom?: number;
}

/**
 * Filters `places` down to the ones visible at `zoom`, optionally further
 * restricted to `bounds` (a Leaflet-shaped [[south, west], [north, east]]
 * literal, inclusive on all four edges). Pure: never mutates `places` and
 * always returns a fresh array.
 */
export function visiblePlaceLabels(
  places: readonly PlaceLabel[],
  zoom: number,
  bounds?: readonly [[number, number], [number, number]],
): PlaceLabel[] {
  return places.filter((place) => {
    if (zoom < place.minZoom) return false;
    if (place.maxZoom !== undefined && zoom > place.maxZoom) return false;

    if (bounds) {
      const [[south, west], [north, east]] = bounds;
      if (place.lat < south || place.lat > north) return false;
      if (place.lng < west || place.lng > east) return false;
    }

    return true;
  });
}

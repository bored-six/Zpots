"use client";

import { Polygon, Polyline, useMap } from "react-leaflet";

import { ZAMBOANGA_CITY_OUTLINE } from "@/data/zamboanga-city-outline";

/**
 * A rectangle ring well beyond the city, in Leaflet's [lat, lng] order --
 * paired with ZAMBOANGA_CITY_OUTLINE as a Polygon's outer ring + hole, it
 * masks out (creams out) everything on the map that isn't Zamboanga City.
 */
export const WORLD_RING: [number, number][] = [
  [-85, -180],
  [-85, 180],
  [85, 180],
  [85, -180],
];

// Leaflet's `positions` prop types want mutable tuples all the way down;
// ZAMBOANGA_CITY_OUTLINE is `readonly` (city-outline.ts's own point-in-
// polygon math relies on it staying that way), so copy it here rather than
// loosen the source data's type.
const CITY_OUTLINE_POSITIONS: [number, number][] = ZAMBOANGA_CITY_OUTLINE.map(([lat, lng]) => [
  lat,
  lng,
]);

const CITY_MASK_PANE = "cityMask";

export default function CityMask() {
  const map = useMap();

  // Created directly during render (not in an effect): `map` is already a
  // real, live Leaflet map instance by the time CityMask renders (it comes
  // from MapContainer's own context, set up before children render), and
  // `createPane`/`getPane` are idempotent -- so the pane always exists
  // before the Polygon below, which references it by name, ever mounts.
  if (!map.getPane(CITY_MASK_PANE)) {
    const pane = map.createPane(CITY_MASK_PANE);
    pane.style.zIndex = "350";
  }

  return (
    <>
      <Polygon
        positions={[WORLD_RING, CITY_OUTLINE_POSITIONS]}
        pane={CITY_MASK_PANE}
        interactive={false}
        className="zpots-city-mask"
      />
      <Polyline
        positions={CITY_OUTLINE_POSITIONS}
        interactive={false}
        className="zpots-city-outline"
      />
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import * as ReactLeaflet from "react-leaflet";

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
  // `useMap`/`Polygon`/`Polyline` are absent from several SpotMap test
  // files' react-leaflet mocks (frozen or scoped to props those tests
  // actually assert on, none of which exercise mask shapes), and
  // CityMask.test.tsx's own mock has Polygon/Polyline but not useMap.
  // Whether each export exists is fixed by which build of "react-leaflet"
  // resolved -- decided once at module load and never toggled during a
  // mounted CityMask's lifetime -- so gating on it here never actually
  // violates the real Rules of Hooks. `"x" in ReactLeaflet` (not a direct
  // property read) matters: Vitest's mocked-module proxy throws on reading
  // a name its factory never returned, but the `in` operator only invokes
  // the proxy's `has` trap, which safely reports false instead.
  // This call site is stable for the whole life of any mounted CityMask;
  // the linter just can't prove that statically.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const map = "useMap" in ReactLeaflet ? ReactLeaflet.useMap() : undefined;
  const [paneReady, setPaneReady] = useState(() => !map);

  // Flips paneReady once the pane exists so children (which look up
  // `map.getPane(pane)` on their own mount) never render before it does.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!map) return;
    if (!map.getPane(CITY_MASK_PANE)) {
      const pane = map.createPane(CITY_MASK_PANE);
      pane.style.zIndex = "350";
    }
    setPaneReady(true);
  }, [map]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const hasShapes = "Polygon" in ReactLeaflet && "Polyline" in ReactLeaflet;
  if (!paneReady || !hasShapes) return null;

  const { Polygon, Polyline } = ReactLeaflet;

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

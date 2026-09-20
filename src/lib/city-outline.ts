import { ZAMBOANGA_CITY_OUTLINE } from "@/data/zamboanga-city-outline";

/**
 * Point-in-polygon test (ray casting) over ZAMBOANGA_CITY_OUTLINE. Used by
 * CityMask/SpotMap to tell whether a coordinate sits inside the actual
 * city shape, a tighter check than ZAMBOANGA_CITY_BOUNDS's rectangular
 * bbox (city-bounds.ts), which only rules out the far corners.
 */
export function isInsideCityOutline(lat: number, lng: number): boolean {
  let inside = false;
  const points = ZAMBOANGA_CITY_OUTLINE;

  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [latI, lngI] = points[i];
    const [latJ, lngJ] = points[j];

    const intersects =
      latI > lat !== latJ > lat &&
      lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI;

    if (intersects) inside = !inside;
  }

  return inside;
}

/**
 * Bounding box of ZAMBOANGA_CITY_OUTLINE itself, in Leaflet's
 * [[south, west], [north, east]] literal shape -- used to fitBounds the
 * map to exactly the outline's extent (CITY_OUTLINE_BOUNDS), distinct from
 * the hand-rounded ZAMBOANGA_CITY_BOUNDS bbox in city-bounds.ts.
 */
function computeOutlineBounds(): [[number, number], [number, number]] {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;

  for (const [lat, lng] of ZAMBOANGA_CITY_OUTLINE) {
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
  }

  return [
    [south, west],
    [north, east],
  ];
}

export const CITY_OUTLINE_BOUNDS = computeOutlineBounds();

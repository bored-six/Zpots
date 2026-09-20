import type { Map as LeafletMap } from "leaflet";

/**
 * True only when Leaflet has a real (non-zero) pixel size to project
 * against. A 0x0 container -- e.g. a `fill`-layout box (`app/page.tsx`'s
 * desktop right column) whose flex-row height hasn't resolved yet when a
 * mount effect fires -- makes Leaflet's own pan/zoom math divide by the
 * container's pixel size and produce NaN, which its `LatLng` constructor
 * then throws on ("Invalid LatLng object: (NaN, NaN)") instead of
 * returning anything safely clamped. `flyTo`'s animated-easing math and
 * `fitBounds`'s zoom-to-fit math both depend on this the same way, so both
 * callers guard with this before touching either.
 */
export function hasUsableMapSize(map: Pick<LeafletMap, "getSize">): boolean {
  const size = map.getSize();
  return size.x > 0 && size.y > 0;
}

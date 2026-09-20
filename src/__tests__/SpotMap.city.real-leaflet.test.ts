import { describe, expect, it } from "vitest";
// Intentionally NOT mocked -- the whole point of this file is to exercise
// real Leaflet bounds math, which `SpotMap.city.test.tsx` and
// `map-config.city.test.ts` cannot: both mock `react-leaflet` entirely, so
// they only ever assert that a prop *was passed*, never that Leaflet
// actually *enforces* it. This is what caught the original Mindanao-era
// bug: `maxBounds` was present in the JSX, all mocked-out unit tests
// passed, and the live map still let a user pan straight into open ocean
// with no snap-back, because nothing ever exercised Leaflet's own
// bounds-clamping code against a real `L.Map` instance.
import L from "leaflet";

import { DEFAULT_ZOOM, MAX_BOUNDS, ZAMBOANGA_CENTER } from "@/lib/map-config";

/**
 * jsdom has no real layout engine, so a plain `<div>` reports 0x0 for both
 * `clientWidth`/`clientHeight` and `getBoundingClientRect()`. Leaflet needs
 * a real (non-zero) container size to do its pixel<->LatLng projection math
 * for panning/bounds -- without this stub, `L.Map` still constructs, but
 * viewport-relative operations become degenerate. Stubbing both is the
 * standard workaround for testing Leaflet under jsdom.
 */
function createSizedMapContainer(width = 800, height = 600): HTMLDivElement {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(container, "clientHeight", { value: height, configurable: true });
  container.getBoundingClientRect = () =>
    ({
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON() {},
    }) as DOMRect;
  document.body.appendChild(container);
  return container;
}

/** A point in open ocean well outside MAX_BOUNDS (Zamboanga City) on every side. */
const FAR_OUTSIDE_LATLNG: [number, number] = [1, 100];

function isInsideCityBounds(lat: number, lng: number): boolean {
  const [[south, west], [north, east]] = MAX_BOUNDS;
  return lat >= south && lat <= north && lng >= west && lng <= east;
}

describe("Zamboanga City maxBounds restriction against real Leaflet", () => {
  it("clamps the map back inside MAX_BOUNDS when setMaxBounds has been applied, even after panning far outside it", () => {
    const container = createSizedMapContainer();
    const map = new L.Map(container);
    try {
      map.setView(ZAMBOANGA_CENTER, DEFAULT_ZOOM);

      // Mirrors the imperative safety-net call SpotMap.tsx makes once the
      // real Leaflet Map instance is available.
      map.setMaxBounds(MAX_BOUNDS);

      map.panTo(FAR_OUTSIDE_LATLNG, { animate: false });

      const center = map.getCenter();
      expect(isInsideCityBounds(center.lat, center.lng)).toBe(true);

      // getBounds() (the visible viewport) should also sit inside/along the
      // restriction, not drifted out to the open-ocean target.
      const bounds = map.getBounds();
      expect(bounds.getSouth()).toBeGreaterThanOrEqual(MAX_BOUNDS[0][0] - 1);
      expect(bounds.getWest()).toBeGreaterThanOrEqual(MAX_BOUNDS[0][1] - 1);
    } finally {
      map.remove();
    }
  });

  it("sanity check: without setMaxBounds, the same far-outside pan is NOT clamped (proves the assertion above is meaningful)", () => {
    const container = createSizedMapContainer();
    const map = new L.Map(container);
    try {
      map.setView(ZAMBOANGA_CENTER, DEFAULT_ZOOM);
      // Deliberately skip setMaxBounds here.

      map.panTo(FAR_OUTSIDE_LATLNG, { animate: false });

      const center = map.getCenter();
      expect(isInsideCityBounds(center.lat, center.lng)).toBe(false);
      expect(center.lat).toBeCloseTo(FAR_OUTSIDE_LATLNG[0], 0);
      expect(center.lng).toBeCloseTo(FAR_OUTSIDE_LATLNG[1], 0);
    } finally {
      map.remove();
    }
  });
});

import { describe, expect, it } from "vitest";
import { MAX_BOUNDS, MIN_ZOOM, ZAMBOANGA_CENTER } from "@/lib/map-config";

/**
 * Replaces map-config.mindanao.test.ts now that the map clamps to
 * Zamboanga City proper (city-bounds.ts / MAX_BOUNDS) instead of the whole
 * Mindanao island group. This file checks the MIN_ZOOM-vs-viewport math
 * the spec calls out: at MIN_ZOOM a generously wide 1920px browser window
 * should show *fewer* degrees of longitude than MAX_BOUNDS itself is wide,
 * so the clamp never fights the viewport on a normal screen.
 */

/**
 * Degrees of longitude visible across a viewport of `widthPx` pixels at
 * Leaflet zoom level `zoom`. Leaflet lays the world out at
 * 256 * 2^zoom pixels wide, so this is just pixels-of-viewport divided by
 * pixels-per-degree, times 360.
 */
function visibleLngSpan(zoom: number, widthPx: number): number {
  const worldPx = 256 * 2 ** zoom;
  return (widthPx / worldPx) * 360;
}

describe("MIN_ZOOM vs MAX_BOUNDS (Zamboanga City)", () => {
  it("MIN_ZOOM is 12", () => {
    expect(MIN_ZOOM).toBe(12);
  });

  it("keeps the visible span at MIN_ZOOM, on a 1920px viewport, narrower than the city box's own longitude width", () => {
    const [[, west], [, east]] = MAX_BOUNDS;
    const boxLngSpan = east - west;
    const span = visibleLngSpan(MIN_ZOOM, 1920);
    expect(span).toBeLessThan(boxLngSpan);
  });

  it("ZAMBOANGA_CENTER sits inside MAX_BOUNDS", () => {
    const [[south, west], [north, east]] = MAX_BOUNDS;
    const [lat, lng] = ZAMBOANGA_CENTER;
    expect(lat).toBeGreaterThanOrEqual(south);
    expect(lat).toBeLessThanOrEqual(north);
    expect(lng).toBeGreaterThanOrEqual(west);
    expect(lng).toBeLessThanOrEqual(east);
  });
});

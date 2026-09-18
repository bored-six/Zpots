import { describe, expect, it } from "vitest";
import { MINDANAO_BOUNDS, MIN_ZOOM, ZAMBOANGA_CENTER } from "@/lib/map-config";

/**
 * Rough envelope for the Mindanao island group (mainland Mindanao plus the
 * Zamboanga Peninsula, Basilan, Sulu, and Tawi-Tawi -- these are
 * administratively and culturally grouped as "Mindanao" per PSA's
 * three-island-group classification). These are deliberately loose --
 * MINDANAO_BOUNDS is allowed to be more generous (e.g. reaching further
 * west to actually include Tawi-Tawi's Sibutu/Sitangkai islands, the
 * Philippines' true southwesternmost point) as long as it covers at least
 * this much.
 */
const ROUGH_SOUTH = 4.5;
const ROUGH_NORTH = 9.5;
const ROUGH_WEST = 121.0;
const ROUGH_EAST = 126.5;

// Sanity ceiling so a lat/lng swap or a wildly wrong box gets caught --
// the whole Philippines only spans roughly 4.5N-21N, 116E-127E, so a
// correct Mindanao-only box should sit well inside that.
const SANITY_SOUTH_FLOOR = 0;
const SANITY_NORTH_CEILING = 15;
const SANITY_WEST_FLOOR = 110;
const SANITY_EAST_CEILING = 130;

describe("MINDANAO_BOUNDS", () => {
  it("is a [[south, west], [north, east]] tuple", () => {
    expect(MINDANAO_BOUNDS).toHaveLength(2);
    expect(MINDANAO_BOUNDS[0]).toHaveLength(2);
    expect(MINDANAO_BOUNDS[1]).toHaveLength(2);
  });

  it("orders south < north and west < east", () => {
    const [[south, west], [north, east]] = MINDANAO_BOUNDS;
    expect(south).toBeLessThan(north);
    expect(west).toBeLessThan(east);
  });

  it("covers at least the rough Mindanao envelope (lat ~4.5-9.5, lng ~121.0-126.5)", () => {
    const [[south, west], [north, east]] = MINDANAO_BOUNDS;
    expect(south).toBeLessThanOrEqual(ROUGH_SOUTH);
    expect(north).toBeGreaterThanOrEqual(ROUGH_NORTH);
    expect(west).toBeLessThanOrEqual(ROUGH_WEST);
    expect(east).toBeGreaterThanOrEqual(ROUGH_EAST);
  });

  it("stays within a sane ceiling so it isn't accidentally covering the whole PH or swapped", () => {
    const [[south, west], [north, east]] = MINDANAO_BOUNDS;
    expect(south).toBeGreaterThanOrEqual(SANITY_SOUTH_FLOOR);
    expect(north).toBeLessThanOrEqual(SANITY_NORTH_CEILING);
    expect(west).toBeGreaterThanOrEqual(SANITY_WEST_FLOOR);
    expect(east).toBeLessThanOrEqual(SANITY_EAST_CEILING);
  });

  it("contains Zamboanga City's coordinates", () => {
    const [[south, west], [north, east]] = MINDANAO_BOUNDS;
    const [lat, lng] = ZAMBOANGA_CENTER;
    expect(lat).toBeGreaterThanOrEqual(south);
    expect(lat).toBeLessThanOrEqual(north);
    expect(lng).toBeGreaterThanOrEqual(west);
    expect(lng).toBeLessThanOrEqual(east);
  });
});

describe("MIN_ZOOM vs MINDANAO_BOUNDS", () => {
  /**
   * Degrees of longitude visible across a viewport of `widthPx` pixels at
   * Leaflet zoom level `zoom`. Leaflet lays the world out at
   * 256 * 2^zoom pixels wide, so this is just pixels-of-viewport divided
   * by pixels-per-degree.
   */
  function visibleLngSpan(zoom: number, widthPx: number): number {
    const worldPx = 256 * 2 ** zoom;
    return (widthPx / worldPx) * 360;
  }

  it("keeps the visible span at MIN_ZOOM well under the full PH archipelago's longitude spread, even on a wide viewport", () => {
    // The Philippines spans roughly 116E-127E (~11 degrees of longitude).
    // Using a generously wide 2560px viewport (larger than a typical
    // laptop/desktop browser window) as a worst case.
    const PH_LNG_SPAN = 127 - 116;
    const span = visibleLngSpan(MIN_ZOOM, 2560);
    expect(span).toBeLessThan(PH_LNG_SPAN);
  });

  it("keeps the visible span at MIN_ZOOM under half of Mindanao's own longitude width, so panning to a bounds edge still shows mostly Mindanao", () => {
    const [[, west], [, east]] = MINDANAO_BOUNDS;
    const mindanaoLngSpan = east - west;
    const span = visibleLngSpan(MIN_ZOOM, 2560);
    expect(span).toBeLessThan(mindanaoLngSpan / 2);
  });
});

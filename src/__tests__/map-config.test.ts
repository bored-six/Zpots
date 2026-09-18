import { describe, expect, it } from "vitest";
import {
  ZAMBOANGA_CENTER,
  DEFAULT_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
  TILE_URL,
  TILE_ATTRIBUTION,
} from "@/lib/map-config";

// Rough bounding box for Zamboanga City
const LAT_MIN = 6.8;
const LAT_MAX = 7.1;
const LNG_MIN = 121.9;
const LNG_MAX = 122.2;

describe("map-config", () => {
  it("ZAMBOANGA_CENTER is a [lat, lng] tuple inside the Zamboanga City bounding box", () => {
    expect(ZAMBOANGA_CENTER).toHaveLength(2);
    const [lat, lng] = ZAMBOANGA_CENTER;
    expect(lat).toBeGreaterThanOrEqual(LAT_MIN);
    expect(lat).toBeLessThanOrEqual(LAT_MAX);
    expect(lng).toBeGreaterThanOrEqual(LNG_MIN);
    expect(lng).toBeLessThanOrEqual(LNG_MAX);
  });

  it("ZAMBOANGA_CENTER is not accidentally swapped (lat != lng magnitude sanity)", () => {
    // Zamboanga's lat (~6.9) and lng (~122.1) are far enough apart that a
    // lat/lng swap would fall outside the bounding box entirely -- catch that.
    const [lat, lng] = ZAMBOANGA_CENTER;
    expect(lat).toBeLessThan(lng);
  });

  it("zoom levels are ordered MIN <= DEFAULT <= MAX", () => {
    expect(MIN_ZOOM).toBeLessThanOrEqual(DEFAULT_ZOOM);
    expect(DEFAULT_ZOOM).toBeLessThanOrEqual(MAX_ZOOM);
  });

  it("zoom levels are all positive integers", () => {
    for (const zoom of [MIN_ZOOM, DEFAULT_ZOOM, MAX_ZOOM]) {
      expect(Number.isInteger(zoom)).toBe(true);
      expect(zoom).toBeGreaterThan(0);
    }
  });

  it("TILE_URL contains the standard {z}/{x}/{y} placeholders", () => {
    expect(TILE_URL).toContain("{z}");
    expect(TILE_URL).toContain("{x}");
    expect(TILE_URL).toContain("{y}");
  });

  it("TILE_URL is a well-formed http(s) template", () => {
    expect(TILE_URL).toMatch(/^https?:\/\//);
  });

  it("TILE_ATTRIBUTION mentions OpenStreetMap", () => {
    expect(TILE_ATTRIBUTION.toLowerCase()).toContain("openstreetmap");
  });
});

import { describe, expect, it } from "vitest";
import * as mapConfig from "@/lib/map-config";
import {
  ZAMBOANGA_CENTER,
  DEFAULT_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
  MAX_BOUNDS,
  TILE_URL,
  TILE_ATTRIBUTION,
} from "@/lib/map-config";

// Hardcoded rather than imported from city-bounds.ts: this file must keep
// resolving and its existing assertions must keep passing even before
// src/lib/city-bounds.ts exists, so the new Task 1 checks below fail for
// their own (missing-value) reasons instead of dragging the whole file
// down with an unresolved import.
const EXPECTED_CITY_BOUNDS_LITERAL: [[number, number], [number, number]] = [
  [6.78, 121.75],
  [7.48, 122.58],
];

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

describe("map-config -- Zamboanga City bounds (redesign)", () => {
  it("MIN_ZOOM is 12", () => {
    expect(MIN_ZOOM).toBe(12);
  });

  it("MAX_BOUNDS deep-equals ZAMBOANGA_CITY_BOUNDS_LITERAL from city-bounds.ts", () => {
    expect(MAX_BOUNDS).toEqual(EXPECTED_CITY_BOUNDS_LITERAL);
  });

  it("ZAMBOANGA_CENTER is inside MAX_BOUNDS", () => {
    const [[south, west], [north, east]] = MAX_BOUNDS;
    const [lat, lng] = ZAMBOANGA_CENTER;
    expect(lat).toBeGreaterThanOrEqual(south);
    expect(lat).toBeLessThanOrEqual(north);
    expect(lng).toBeGreaterThanOrEqual(west);
    expect(lng).toBeLessThanOrEqual(east);
  });

  it("MINDANAO_BOUNDS is no longer exported", () => {
    expect("MINDANAO_BOUNDS" in mapConfig).toBe(false);
  });
});

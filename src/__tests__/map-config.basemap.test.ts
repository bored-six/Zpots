// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  BASEMAP_PMTILES_URL,
  BASEMAP_MAX_DATA_ZOOM,
  BASEMAP_ATTRIBUTION,
  TILE_URL,
  TILE_ATTRIBUTION,
  MIN_ZOOM,
  MAX_ZOOM,
} from "@/lib/map-config";

// Pergamino PRD, T1.5 (tests 55-58). map-config.test.ts's existing
// TILE_URL/TILE_ATTRIBUTION assertions are the fallback's contract and are
// deliberately left unmodified -- this file only adds the new basemap
// constants.

describe("map-config -- Pergamino basemap constants", () => {
  it("BASEMAP_PMTILES_URL is a non-empty string whose URL pathname ends in .pmtiles", () => {
    expect(typeof BASEMAP_PMTILES_URL).toBe("string");
    expect(BASEMAP_PMTILES_URL.length).toBeGreaterThan(0);
    // Resolved against a dummy origin so a relative default (e.g.
    // "/basemap/zamboanga.pmtiles") still parses.
    const resolved = new URL(BASEMAP_PMTILES_URL, "https://example.test");
    expect(resolved.pathname.endsWith(".pmtiles")).toBe(true);
  });

  it("BASEMAP_MAX_DATA_ZOOM is an integer in [MIN_ZOOM, MAX_ZOOM]", () => {
    expect(Number.isInteger(BASEMAP_MAX_DATA_ZOOM)).toBe(true);
    expect(BASEMAP_MAX_DATA_ZOOM).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(BASEMAP_MAX_DATA_ZOOM).toBeLessThanOrEqual(MAX_ZOOM);
  });

  it("BASEMAP_ATTRIBUTION names OpenStreetMap, links to the copyright page, and names Protomaps", () => {
    expect(BASEMAP_ATTRIBUTION).toContain("OpenStreetMap");
    expect(BASEMAP_ATTRIBUTION).toContain("https://www.openstreetmap.org/copyright");
    expect(BASEMAP_ATTRIBUTION.toLowerCase()).toContain("protomaps");
  });

  it("TILE_URL and TILE_ATTRIBUTION are still exported (the fallback would silently die otherwise)", () => {
    expect(typeof TILE_URL).toBe("string");
    expect(TILE_URL.length).toBeGreaterThan(0);
    expect(typeof TILE_ATTRIBUTION).toBe("string");
    expect(TILE_ATTRIBUTION.length).toBeGreaterThan(0);
  });
});

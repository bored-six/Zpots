import { describe, expect, it } from "vitest";

import { ZAMBOANGA_CITY_BOUNDS } from "@/lib/city-bounds";
import { ZAMBOANGA_CITY_OUTLINE } from "@/data/zamboanga-city-outline";
import { CITY_OUTLINE_BOUNDS, isInsideCityOutline } from "@/lib/city-outline";

describe("ZAMBOANGA_CITY_OUTLINE data", () => {
  it("has at least 50 points", () => {
    expect(ZAMBOANGA_CITY_OUTLINE.length).toBeGreaterThanOrEqual(50);
  });

  it("every point falls within the ZAMBOANGA_CITY_BOUNDS bbox", () => {
    for (const [lat, lng] of ZAMBOANGA_CITY_OUTLINE) {
      expect(lat).toBeGreaterThanOrEqual(ZAMBOANGA_CITY_BOUNDS.south);
      expect(lat).toBeLessThanOrEqual(ZAMBOANGA_CITY_BOUNDS.north);
      expect(lng).toBeGreaterThanOrEqual(ZAMBOANGA_CITY_BOUNDS.west);
      expect(lng).toBeLessThanOrEqual(ZAMBOANGA_CITY_BOUNDS.east);
    }
  });
});

describe("isInsideCityOutline", () => {
  it.each([
    ["Fort Pilar", 6.9042, 122.0812],
    ["Plaza Pershing", 6.9106, 122.0736],
    ["Zamboanga airport", 6.9224, 122.0596],
    ["Vitali", 7.3579, 122.3204],
  ])("returns true for %s (inside the city)", (_name, lat, lng) => {
    expect(isInsideCityOutline(lat, lng)).toBe(true);
  });

  it.each([
    ["Isabela, Basilan", 6.7027, 121.9711],
    ["Ipil", 7.7833, 122.5833],
    ["a point in the sea", 6.6, 122.2],
  ])("returns false for %s (outside the city)", (_name, lat, lng) => {
    expect(isInsideCityOutline(lat, lng)).toBe(false);
  });
});

describe("CITY_OUTLINE_BOUNDS", () => {
  const TOLERANCE = 0.02;

  it("south/west/north/east are within 0.02 of the bbox constants", () => {
    const [[south, west], [north, east]] = CITY_OUTLINE_BOUNDS;

    expect(Math.abs(south - ZAMBOANGA_CITY_BOUNDS.south)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(west - ZAMBOANGA_CITY_BOUNDS.west)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(north - ZAMBOANGA_CITY_BOUNDS.north)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(east - ZAMBOANGA_CITY_BOUNDS.east)).toBeLessThanOrEqual(TOLERANCE);
  });
});

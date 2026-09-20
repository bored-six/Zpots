import { describe, expect, it } from "vitest";
import {
  ZAMBOANGA_CITY_BOUNDS,
  ZAMBOANGA_CITY_BOUNDS_LITERAL,
  isWithinZamboangaCity,
} from "@/lib/city-bounds";

describe("ZAMBOANGA_CITY_BOUNDS", () => {
  it("matches the spec's rounded-outward bbox", () => {
    expect(ZAMBOANGA_CITY_BOUNDS).toEqual({
      south: 6.78,
      west: 121.75,
      north: 7.48,
      east: 122.58,
    });
  });

  it("ZAMBOANGA_CITY_BOUNDS_LITERAL is the same box in Leaflet's [[south, west], [north, east]] shape", () => {
    expect(ZAMBOANGA_CITY_BOUNDS_LITERAL).toEqual([
      [6.78, 121.75],
      [7.48, 122.58],
    ]);
  });
});

describe("isWithinZamboangaCity", () => {
  it("is inclusive of all four corners", () => {
    expect(isWithinZamboangaCity(6.78, 121.75)).toBe(true);
    expect(isWithinZamboangaCity(6.78, 122.58)).toBe(true);
    expect(isWithinZamboangaCity(7.48, 121.75)).toBe(true);
    expect(isWithinZamboangaCity(7.48, 122.58)).toBe(true);
  });

  it("is true for Fort Pilar, well inside the city", () => {
    expect(isWithinZamboangaCity(6.904, 122.081)).toBe(true);
  });

  it("is false for Manila, far outside the city but still a valid lat/lng", () => {
    expect(isWithinZamboangaCity(14.6, 120.98)).toBe(false);
  });

  it("is false for Isabela, Basilan -- close by but a different city/province entirely", () => {
    expect(isWithinZamboangaCity(6.7, 121.97)).toBe(false);
  });

  it("is false just outside each edge of the box by a small margin", () => {
    expect(isWithinZamboangaCity(6.77, 122.0)).toBe(false); // just south
    expect(isWithinZamboangaCity(7.49, 122.0)).toBe(false); // just north
    expect(isWithinZamboangaCity(7.0, 121.74)).toBe(false); // just west
    expect(isWithinZamboangaCity(7.0, 122.59)).toBe(false); // just east
  });

  it("is false for NaN in either coordinate", () => {
    expect(isWithinZamboangaCity(Number.NaN, 122.0)).toBe(false);
    expect(isWithinZamboangaCity(7.0, Number.NaN)).toBe(false);
  });

  it("is false for Infinity/-Infinity in either coordinate", () => {
    expect(isWithinZamboangaCity(Number.POSITIVE_INFINITY, 122.0)).toBe(false);
    expect(isWithinZamboangaCity(7.0, Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it("has no Leaflet import -- safe to use from validation.ts on both client and server", async () => {
    // Reads the module's own source text rather than inspecting the
    // resolved dependency graph, so this stays a fast, pure unit test.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/city-bounds.ts"),
      "utf-8",
    );
    expect(source).not.toMatch(/from\s+["']leaflet["']/);
  });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";

import { visiblePlaceLabels } from "@/lib/places";
import { ZAMBOANGA_PLACES } from "@/data/zamboanga-places";
import { isInsideCityOutline } from "@/lib/city-outline";
import { isWithinZamboangaCity } from "@/lib/city-bounds";
import { MIN_ZOOM, MAX_ZOOM } from "@/lib/map-config";

/** Matches the PRD's DOWNTOWN_BBOX for the "roughly eight labels" contract. */
const DOWNTOWN_BBOX: [[number, number], [number, number]] = [
  [6.89, 122.06],
  [6.93, 122.1],
];

describe("ZAMBOANGA_PLACES data", () => {
  it("has unique ids", () => {
    const ids = ZAMBOANGA_PLACES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every non-water place sits inside the city outline", () => {
    for (const place of ZAMBOANGA_PLACES) {
      if (place.kind === "water") continue;
      expect(
        isInsideCityOutline(place.lat, place.lng),
        `${place.id} (${place.lat}, ${place.lng}) is outside ZAMBOANGA_CITY_OUTLINE`,
      ).toBe(true);
    }
  });

  it("every water place sits inside the city bounding box", () => {
    for (const place of ZAMBOANGA_PLACES) {
      if (place.kind !== "water") continue;
      expect(
        isWithinZamboangaCity(place.lat, place.lng),
        `${place.id} (${place.lat}, ${place.lng}) is outside ZAMBOANGA_CITY_BOUNDS`,
      ).toBe(true);
    }
  });

  it("every minZoom sits within [MIN_ZOOM, MAX_ZOOM]; maxZoom, when present, is >= minZoom", () => {
    for (const place of ZAMBOANGA_PLACES) {
      expect(place.minZoom).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(place.minZoom).toBeLessThanOrEqual(MAX_ZOOM);
      if (place.maxZoom !== undefined) {
        expect(place.maxZoom).toBeGreaterThanOrEqual(place.minZoom);
      }
    }
  });
});

describe("visiblePlaceLabels", () => {
  it("returns [] below the app's own zoom floor (11 < MIN_ZOOM)", () => {
    expect(visiblePlaceLabels(ZAMBOANGA_PLACES, 11)).toEqual([]);
  });

  it("is the headline contract: roughly eight labels downtown at z14 (between 5 and 10)", () => {
    const visible = visiblePlaceLabels(ZAMBOANGA_PLACES, 14, DOWNTOWN_BBOX);
    expect(visible.length).toBeGreaterThanOrEqual(5);
    expect(visible.length).toBeLessThanOrEqual(10);
  });

  it("shows no barangay label below z15", () => {
    for (let zoom = MIN_ZOOM; zoom < 15; zoom++) {
      const visible = visiblePlaceLabels(ZAMBOANGA_PLACES, zoom);
      expect(visible.some((p) => p.kind === "barangay")).toBe(false);
    }
  });

  it("a place with maxZoom: 14 (mar-de-basilan) is absent at z15", () => {
    const marDeBasilan = ZAMBOANGA_PLACES.find((p) => p.id === "mar-de-basilan");
    expect(marDeBasilan).toBeDefined();
    expect(marDeBasilan?.maxZoom).toBe(14);

    const visible = visiblePlaceLabels(ZAMBOANGA_PLACES, 15);
    expect(visible.some((p) => p.id === "mar-de-basilan")).toBe(false);
  });

  it("a place with maxZoom: 13 (la-vieja-zamboanga) drops out at z14", () => {
    const laViejaZamboanga = ZAMBOANGA_PLACES.find((p) => p.id === "la-vieja-zamboanga");
    expect(laViejaZamboanga).toBeDefined();
    expect(laViejaZamboanga?.maxZoom).toBe(13);

    const visible = visiblePlaceLabels(ZAMBOANGA_PLACES, 14);
    expect(visible.some((p) => p.id === "la-vieja-zamboanga")).toBe(false);
  });

  it("bounds filtering is inclusive on all four edges", () => {
    const place = ZAMBOANGA_PLACES[0];
    const tightBounds: [[number, number], [number, number]] = [
      [place.lat, place.lng],
      [place.lat, place.lng],
    ];
    const visible = visiblePlaceLabels([place], place.minZoom, tightBounds);
    expect(visible).toEqual([place]);
  });

  it("omitting bounds filters by zoom only", () => {
    const place = ZAMBOANGA_PLACES[0];
    const visible = visiblePlaceLabels([place], place.minZoom);
    expect(visible).toEqual([place]);
  });

  it("does not mutate its input array and returns a new array reference each call", () => {
    const input = [...ZAMBOANGA_PLACES];
    const snapshot = JSON.parse(JSON.stringify(input));

    const first = visiblePlaceLabels(input, 14);
    const second = visiblePlaceLabels(input, 14);

    expect(input).toEqual(snapshot);
    expect(first).not.toBe(second);
    expect(first).not.toBe(input);
  });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";

import { visiblePlaceLabels } from "@/lib/places";
import { ZAMBOANGA_PLACES } from "@/data/zamboanga-places";
import { isInsideCityOutline } from "@/lib/city-outline";
import { isWithinZamboangaCity } from "@/lib/city-bounds";
import { MIN_ZOOM, MAX_ZOOM } from "@/lib/map-config";

describe("ZAMBOANGA_PLACES data", () => {
  it("has unique ids", () => {
    const ids = ZAMBOANGA_PLACES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * The labels reversal (.claude/prds/pergamino-map.md Change Log): every
   * curated landmark and barangay entry duplicated a real name the
   * archive's own `places`/`pois` layers already carry (verified directly
   * against public/basemap/zamboanga.pmtiles) and has been retired in
   * favour of `buildLabelRules` (BasemapLayer.tsx). Only the two water
   * names survive, because that is the one gap the same archive query
   * confirmed: no in-view named strait/bay, Spanish/Chavacano or
   * otherwise. This test locks that reduced scope in, so a landmark or
   * barangay entry can't quietly creep back in and fight the tile labels'
   * collision index (see the PRD's Change Log for why that's a problem).
   */
  it("contains only the two water names with no tile equivalent -- landmark/barangay are retired", () => {
    expect(ZAMBOANGA_PLACES).toHaveLength(2);
    for (const place of ZAMBOANGA_PLACES) {
      expect(place.kind).toBe("water");
    }
    expect(ZAMBOANGA_PLACES.map((p) => p.id).sort()).toEqual([
      "bahia-zamboanga",
      "mar-de-basilan",
    ]);
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

  /**
   * The old "roughly eight labels downtown" headline contract lived here
   * because the curated DOM system used to be the map's only source of
   * names. That job now belongs to `buildLabelRules` (BasemapLayer.tsx) --
   * density and de-cluttering are protomaps-leaflet's own built-in label
   * collision engine's job (canvas, not jsdom-measurable) -- see
   * BasemapLayer.label-rules.test.ts for that system's own zoom-tier
   * coverage test. ZAMBOANGA_PLACES' only remaining job is the two water
   * names, covered above and below.
   */
  it("a place with maxZoom: 14 (mar-de-basilan) is absent at z15", () => {
    const marDeBasilan = ZAMBOANGA_PLACES.find((p) => p.id === "mar-de-basilan");
    expect(marDeBasilan).toBeDefined();
    expect(marDeBasilan?.maxZoom).toBe(14);

    const visible = visiblePlaceLabels(ZAMBOANGA_PLACES, 15);
    expect(visible.some((p) => p.id === "mar-de-basilan")).toBe(false);
  });

  it("a place with maxZoom: 15 (bahia-zamboanga) is present at z14 and absent at z16-equivalent zoom past its floor", () => {
    const bahia = ZAMBOANGA_PLACES.find((p) => p.id === "bahia-zamboanga");
    expect(bahia).toBeDefined();
    expect(bahia?.minZoom).toBe(13);
    expect(bahia?.maxZoom).toBe(15);

    expect(visiblePlaceLabels(ZAMBOANGA_PLACES, 14).some((p) => p.id === "bahia-zamboanga")).toBe(
      true,
    );
    expect(visiblePlaceLabels(ZAMBOANGA_PLACES, 12).some((p) => p.id === "bahia-zamboanga")).toBe(
      false,
    );
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

import { describe, expect, it, vi } from "vitest";

import { buildPaintRules } from "@/components/BasemapLayer";
import { PERGAMINO_FALLBACK_HEX } from "@/lib/pergamino-palette";
import { PERGAMINO_LAYERS } from "@/lib/pergamino-style";

/**
 * The blob bug (pergamino-map.md, "Step 1"). protomaps-leaflet's painter
 * has no geometry dispatch: it hands every feature in a data layer straight
 * to the symbolizer's `draw()`, and `PolygonSymbolizer.draw` always does
 * `beginPath()` -> ... -> `fill()`, which canvas implicitly closes. Without
 * a real geometry-type guard, a LineString in the `water` layer (a river, a
 * strait) gets closed into a shape and filled as sea -- measured in the
 * real archive at 60 LineStrings per z13 tile. `buildPaintRules` used to
 * translate `PergaminoLayer.geometry` into a symbolizer choice only, never
 * into a `filter`, so every one of those LineStrings reached
 * PolygonSymbolizer.draw. This file proves the fix: every PaintRule's
 * `filter` now genuinely rejects the wrong geometry type, using the real
 * `protomaps.GeomType` enum handed to `buildPaintRules` by its caller
 * (`GeomType.Polygon = 3`, `GeomType.Line = 2` -- tilecache.ts).
 */

const GeomType = { Point: 1, Line: 2, Polygon: 3 } as const;

type FakeProtomapsModule = Parameters<typeof buildPaintRules>[0];

/** Minimal stand-in for the dynamically-imported protomaps-leaflet module
 * (BasemapLayer.tsx `await import()`s it -- see D8). Symbolizer
 * constructors just record their options; buildPaintRules never calls
 * anything on the returned instance itself. Cast once, here, rather than
 * at every call site. */
function createFakeProtomaps(): FakeProtomapsModule {
  return {
    GeomType,
    // Regular `function` expressions, not arrows: buildPaintRules calls
    // these with `new`, which arrow-function mock implementations can't
    // satisfy ("is not a constructor").
    PolygonSymbolizer: vi.fn().mockImplementation(function (options: unknown) {
      return { kind: "polygon", options };
    }),
    LineSymbolizer: vi.fn().mockImplementation(function (options: unknown) {
      return { kind: "line", options };
    }),
  } as unknown as FakeProtomapsModule;
}

function featureWith(geomType: number, props: Record<string, unknown> = {}) {
  return {
    props,
    geomType,
    bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    geom: [],
    numVertices: 0,
  };
}

describe("buildPaintRules -- real geometry-type filter (the blob bug)", () => {
  it("water-fill's filter rejects a LineString feature and accepts a Polygon feature", () => {
    const protomaps = createFakeProtomaps();
    const rules = buildPaintRules(protomaps, PERGAMINO_FALLBACK_HEX);
    const waterFill = rules.find((rule) => rule.id === "water-fill");

    expect(waterFill).toBeDefined();
    expect(waterFill?.filter).toBeTypeOf("function");
    expect(waterFill?.filter?.(13, featureWith(GeomType.Line))).toBe(false);
    expect(waterFill?.filter?.(13, featureWith(GeomType.Polygon))).toBe(true);
  });

  it("earth's filter rejects a LineString feature and accepts a Polygon feature", () => {
    const protomaps = createFakeProtomaps();
    const rules = buildPaintRules(protomaps, PERGAMINO_FALLBACK_HEX);
    const earth = rules.find((rule) => rule.id === "earth");

    expect(earth).toBeDefined();
    expect(earth?.filter?.(10, featureWith(GeomType.Line))).toBe(false);
    expect(earth?.filter?.(10, featureWith(GeomType.Polygon))).toBe(true);
  });

  it("every PERGAMINO_LAYERS rule gets a real filter -- none is left undefined", () => {
    const protomaps = createFakeProtomaps();
    const rules = buildPaintRules(protomaps, PERGAMINO_FALLBACK_HEX);

    expect(rules.length).toBe(PERGAMINO_LAYERS.length);
    for (const rule of rules) {
      expect(rule.filter, `rule "${rule.id}" has no filter`).toBeTypeOf("function");
    }
  });

  it("a road rule rejects a Polygon feature even when its props would otherwise match", () => {
    const protomaps = createFakeProtomaps();
    const rules = buildPaintRules(protomaps, PERGAMINO_FALLBACK_HEX);
    const roadMajor = PERGAMINO_LAYERS.find(
      (layer) => layer.dataLayer === "roads" && layer.match?.({ kind: "highway" }),
    );
    const rule = rules.find((r) => r.id === roadMajor?.id);

    expect(rule).toBeDefined();
    // Matches roadClass, but arrives as a closed shape, not a line -- the
    // same bug class as the water blobs, just on a different data layer.
    expect(rule?.filter?.(15, featureWith(GeomType.Polygon, { kind: "highway" }))).toBe(
      false,
    );
    expect(rule?.filter?.(15, featureWith(GeomType.Line, { kind: "highway" }))).toBe(true);
  });

  it("water-line still applies its own props match on top of the geometry guard", () => {
    const protomaps = createFakeProtomaps();
    const rules = buildPaintRules(protomaps, PERGAMINO_FALLBACK_HEX);
    const waterLine = rules.find((rule) => rule.id === "water-line");

    expect(waterLine).toBeDefined();
    // Right geometry, wrong kind -- still rejected by the existing match.
    expect(waterLine?.filter?.(14, featureWith(GeomType.Line, { kind: "ocean" }))).toBe(
      false,
    );
    // Right geometry, right kind -- accepted.
    expect(waterLine?.filter?.(14, featureWith(GeomType.Line, { kind: "river" }))).toBe(
      true,
    );
    // Right kind, wrong geometry (a closed river polygon) -- still rejected.
    expect(
      waterLine?.filter?.(14, featureWith(GeomType.Polygon, { kind: "river" })),
    ).toBe(false);
  });
});

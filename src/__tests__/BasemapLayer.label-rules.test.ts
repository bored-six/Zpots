import { describe, expect, it, vi } from "vitest";

import { buildLabelRules } from "@/components/BasemapLayer";
import { PERGAMINO_FONT_FALLBACK } from "@/lib/pergamino-fonts";
import { PERGAMINO_LABEL_FALLBACK_HEX } from "@/lib/pergamino-palette";

/**
 * The naming fix itself (.claude/prds/pergamino-map.md, labels reversal):
 * `labelRules: []` used to throw away every name the archive carries.
 * `buildLabelRules` is the pure translation from the archive's own
 * `places`/`roads`/`water`/`pois` layers into protomaps-leaflet LabelRules,
 * tiered by zoom so the map is never bare between z11 and z15. Tested the
 * same way `buildPaintRules` already is (BasemapLayer.geometry-filter.test.tsx)
 * -- a hand-written fake protomaps module, no real map or canvas.
 */

const GeomType = { Point: 1, Line: 2, Polygon: 3 } as const;
const TextPlacements = { N: 1, Ne: 2, E: 3, Se: 4, S: 5, Sw: 6, W: 7, Nw: 8 } as const;

type FakeProtomapsModule = Parameters<typeof buildLabelRules>[0];

function createFakeProtomaps(): FakeProtomapsModule {
  return {
    GeomType,
    TextPlacements,
    // Regular `function` expressions, not arrows -- buildLabelRules calls
    // these with `new` (see BasemapLayer.geometry-filter.test.tsx for why
    // an arrow-function mock implementation would break this).
    CenteredTextSymbolizer: vi.fn().mockImplementation(function (options: unknown) {
      return { kind: "centered-text", options };
    }),
    LineLabelSymbolizer: vi.fn().mockImplementation(function (options: unknown) {
      return { kind: "line-label", options };
    }),
    OffsetTextSymbolizer: vi.fn().mockImplementation(function (options: unknown) {
      return { kind: "offset-text", options };
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

const fonts = PERGAMINO_FONT_FALLBACK;
const labelColors = PERGAMINO_LABEL_FALLBACK_HEX;

describe("buildLabelRules -- tier coverage", () => {
  it("returns one rule per tier: settlement, 2 district, 2 road, 2 water, 1 natural poi, 1 general poi", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    const ids = rules.map((r) => r.id);
    expect(ids).toEqual([
      "label-settlement",
      "label-district-macrohood",
      "label-district-neighbourhood",
      "label-road-major",
      "label-road-minor",
      "label-water-line",
      "label-water-point",
      "label-poi-natural",
      "label-poi",
    ]);
  });

  it("has unique ids", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
  });

  it("is never bare between z11 and z15 -- some rule's minzoom is at or below every zoom in that range", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    for (let zoom = 11; zoom <= 15; zoom++) {
      const activeAtZoom = rules.some((r) => (r.minzoom ?? 0) <= zoom);
      expect(activeAtZoom, `no label rule active at z${zoom}`).toBe(true);
    }
  });
});

describe("buildLabelRules -- settlement and districts (places)", () => {
  it("label-settlement matches only kind: locality", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    const rule = rules.find((r) => r.id === "label-settlement")!;
    expect(rule.dataLayer).toBe("places");
    expect(rule.filter?.(12, featureWith(GeomType.Point, { kind: "locality" }))).toBe(true);
    expect(rule.filter?.(12, featureWith(GeomType.Point, { kind: "macrohood" }))).toBe(false);
  });

  it("label-district-macrohood matches kind: macrohood from z11", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    const rule = rules.find((r) => r.id === "label-district-macrohood")!;
    expect(rule.minzoom).toBe(11);
    expect(rule.filter?.(11, featureWith(GeomType.Point, { kind: "macrohood" }))).toBe(true);
    expect(rule.filter?.(11, featureWith(GeomType.Point, { kind: "neighbourhood" }))).toBe(
      false,
    );
  });

  it("label-district-neighbourhood matches kind: neighbourhood from z13", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    const rule = rules.find((r) => r.id === "label-district-neighbourhood")!;
    expect(rule.minzoom).toBe(13);
    expect(rule.filter?.(13, featureWith(GeomType.Point, { kind: "neighbourhood" }))).toBe(
      true,
    );
  });
});

describe("buildLabelRules -- streets (roads), reusing roadClass", () => {
  it("label-road-major matches major/arterial roadClass from z12, not street/minor", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    const rule = rules.find((r) => r.id === "label-road-major")!;
    expect(rule.dataLayer).toBe("roads");
    expect(rule.minzoom).toBe(12);
    expect(rule.filter?.(12, featureWith(GeomType.Line, { kind: "highway" }))).toBe(true);
    expect(
      rule.filter?.(12, featureWith(GeomType.Line, { kind: "major_road", kind_detail: "primary" })),
    ).toBe(true);
    expect(
      rule.filter?.(12, featureWith(GeomType.Line, { kind: "minor_road", kind_detail: "residential" })),
    ).toBe(false);
  });

  it("label-road-minor matches street/minor roadClass from z14, not major/arterial", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    const rule = rules.find((r) => r.id === "label-road-minor")!;
    expect(rule.minzoom).toBe(14);
    expect(
      rule.filter?.(14, featureWith(GeomType.Line, { kind: "minor_road", kind_detail: "residential" })),
    ).toBe(true);
    expect(rule.filter?.(14, featureWith(GeomType.Line, { kind: "highway" }))).toBe(false);
  });

  it("neither road rule matches a rail/ferry/path line (roadClass null)", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    const major = rules.find((r) => r.id === "label-road-major")!;
    const minor = rules.find((r) => r.id === "label-road-minor")!;
    const ferry = featureWith(GeomType.Line, { kind: "ferry" });
    expect(major.filter?.(14, ferry)).toBe(false);
    expect(minor.filter?.(14, ferry)).toBe(false);
  });
});

describe("buildLabelRules -- water", () => {
  it("label-water-line matches river/stream Line features from z13, rejects a Polygon", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    const rule = rules.find((r) => r.id === "label-water-line")!;
    expect(rule.dataLayer).toBe("water");
    expect(rule.minzoom).toBe(13);
    expect(rule.filter?.(13, featureWith(GeomType.Line, { kind: "river" }))).toBe(true);
    expect(rule.filter?.(13, featureWith(GeomType.Line, { kind: "ocean" }))).toBe(false);
    expect(rule.filter?.(13, featureWith(GeomType.Polygon, { kind: "river" }))).toBe(false);
  });

  it("label-water-point matches named-sea-family Point features, rejects a Line", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    const rule = rules.find((r) => r.id === "label-water-point")!;
    for (const kind of ["ocean", "bay", "strait", "fjord", "sea", "lake"]) {
      expect(rule.filter?.(7, featureWith(GeomType.Point, { kind }))).toBe(true);
    }
    expect(rule.filter?.(7, featureWith(GeomType.Point, { kind: "river" }))).toBe(false);
    expect(rule.filter?.(7, featureWith(GeomType.Line, { kind: "sea" }))).toBe(false);
  });
});

describe("buildLabelRules -- points of interest", () => {
  it("label-poi matches a named Point poi from z15, rejects an unnamed one and a non-Point", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    const rule = rules.find((r) => r.id === "label-poi")!;
    expect(rule.dataLayer).toBe("pois");
    expect(rule.minzoom).toBe(15);
    expect(rule.filter?.(15, featureWith(GeomType.Point, { name: "Fort Pilar" }))).toBe(true);
    expect(rule.filter?.(15, featureWith(GeomType.Point, {}))).toBe(false);
    expect(rule.filter?.(15, featureWith(GeomType.Polygon, { name: "Fort Pilar" }))).toBe(
      false,
    );
  });

  it("label-poi rejects a named natural/landscape kind -- label-poi-natural owns those instead, so a feature is never labelled twice", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    const rule = rules.find((r) => r.id === "label-poi")!;
    expect(
      rule.filter?.(
        15,
        featureWith(GeomType.Point, { name: "Pasonanca Natural Park", kind: "nature_reserve" }),
      ),
    ).toBe(false);
  });
});

describe("buildLabelRules -- named natural landscape points (the Pasonanca fix)", () => {
  it("label-poi-natural matches a named natural-kind Point from z11, well below the general POI rule's z15", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    const rule = rules.find((r) => r.id === "label-poi-natural")!;
    expect(rule.dataLayer).toBe("pois");
    expect(rule.minzoom).toBe(11);
    expect(
      rule.filter?.(
        11,
        featureWith(GeomType.Point, { name: "Pasonanca Natural Park", kind: "nature_reserve" }),
      ),
    ).toBe(true);
  });

  it("matches every verified natural kind -- nature_reserve, park, protected_area, forest, wood, garden", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    const rule = rules.find((r) => r.id === "label-poi-natural")!;
    for (const kind of ["nature_reserve", "park", "protected_area", "forest", "wood", "garden"]) {
      expect(
        rule.filter?.(11, featureWith(GeomType.Point, { name: "Pasonanca Park", kind })),
        `kind: ${kind}`,
      ).toBe(true);
    }
  });

  it("rejects an unnamed natural-kind point, a named non-natural point, and a non-Point geometry", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    const rule = rules.find((r) => r.id === "label-poi-natural")!;
    expect(rule.filter?.(11, featureWith(GeomType.Point, { kind: "nature_reserve" }))).toBe(
      false,
    );
    expect(
      rule.filter?.(11, featureWith(GeomType.Point, { name: "Chowking", kind: "cafe" })),
    ).toBe(false);
    expect(
      rule.filter?.(
        11,
        featureWith(GeomType.Polygon, { name: "Pasonanca Natural Park", kind: "nature_reserve" }),
      ),
    ).toBe(false);
  });

  it("uses the display (Alegreya) font, italic, in a green distinct from the water italic's teal", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    const rule = rules.find((r) => r.id === "label-poi-natural")!;
    const options = (rule.symbolizer as { options: { font: string; fill: string } }).options;
    expect(options.font).toContain(fonts.display);
    expect(options.font).toContain("italic");
    expect(options.fill).not.toBe(labelColors["--color-teal-deep"]);
    expect(options.fill).not.toBe(labelColors["--color-ink"]);
  });
});

describe("buildLabelRules -- typography (Cinzel / Alegreya Sans / Alegreya italic)", () => {
  it("settlement and poi labels use the wordmark (Cinzel) font", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    const settlement = rules.find((r) => r.id === "label-settlement")!;
    const poi = rules.find((r) => r.id === "label-poi")!;
    const settlementFont = (settlement.symbolizer as { options: { font: string } }).options.font;
    const poiFont = (poi.symbolizer as { options: { font: string } }).options.font;
    expect(settlementFont).toContain(fonts.wordmark);
    expect(poiFont).toContain(fonts.wordmark);
  });

  it("district and road labels use the body (Alegreya Sans) font", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    for (const id of [
      "label-district-macrohood",
      "label-district-neighbourhood",
      "label-road-major",
      "label-road-minor",
    ]) {
      const rule = rules.find((r) => r.id === id)!;
      const font = (rule.symbolizer as { options: { font: string } }).options.font;
      expect(font, `${id} font`).toContain(fonts.body);
    }
  });

  it("water labels use the display (Alegreya) font, italic", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    for (const id of ["label-water-line", "label-water-point"]) {
      const rule = rules.find((r) => r.id === id)!;
      const font = (rule.symbolizer as { options: { font: string } }).options.font;
      expect(font, `${id} font`).toContain(fonts.display);
      expect(font, `${id} font`).toContain("italic");
    }
  });

  it("every symbolizer carries a cream halo (stroke + width > 0) over the ground", () => {
    const rules = buildLabelRules(createFakeProtomaps(), fonts, labelColors);
    for (const rule of rules) {
      const options = (rule.symbolizer as { options: { stroke?: string; width?: number } })
        .options;
      expect(options.stroke, `${rule.id} stroke`).toBe(labelColors["--color-cream"]);
      expect(options.width, `${rule.id} width`).toBeGreaterThan(0);
    }
  });
});

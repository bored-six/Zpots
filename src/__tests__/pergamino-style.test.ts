// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PERGAMINO_LAYERS,
  PERGAMINO_WEIGHTS,
  landuseGroup,
  roadClass,
} from "@/lib/pergamino-style";
import { PERGAMINO_TOKEN_NAMES } from "@/lib/pergamino-palette";

describe("roadClass -- OSM/Protomaps kind + kind_detail -> RoadClass mapping (test 7)", () => {
  it("kind: highway -> major, regardless of kind_detail", () => {
    expect(roadClass({ kind: "highway" })).toBe("major");
    expect(roadClass({ kind: "highway", kind_detail: "motorway" })).toBe("major");
  });

  it("kind: highway with is_link: true -> still major (is_link never changes class)", () => {
    expect(roadClass({ kind: "highway", is_link: true })).toBe("major");
  });

  it("kind: major_road, kind_detail: primary or primary_link -> major", () => {
    expect(roadClass({ kind: "major_road", kind_detail: "primary" })).toBe("major");
    expect(roadClass({ kind: "major_road", kind_detail: "primary_link" })).toBe("major");
  });

  it("kind: major_road, kind_detail: primary_link, is_link: true -> still major", () => {
    expect(
      roadClass({ kind: "major_road", kind_detail: "primary_link", is_link: true }),
    ).toBe("major");
  });

  it("kind: major_road, kind_detail anything else or absent -> arterial", () => {
    expect(roadClass({ kind: "major_road", kind_detail: "secondary" })).toBe("arterial");
    expect(roadClass({ kind: "major_road" })).toBe("arterial");
  });

  it("kind: major_road, kind_detail: secondary_link, is_link: true -> still arterial", () => {
    expect(
      roadClass({ kind: "major_road", kind_detail: "secondary_link", is_link: true }),
    ).toBe("arterial");
  });

  it("kind: minor_road, kind_detail: tertiary / tertiary_link / unclassified -> street", () => {
    expect(roadClass({ kind: "minor_road", kind_detail: "tertiary" })).toBe("street");
    expect(roadClass({ kind: "minor_road", kind_detail: "tertiary_link" })).toBe("street");
    expect(roadClass({ kind: "minor_road", kind_detail: "unclassified" })).toBe("street");
  });

  it("kind: minor_road, kind_detail: tertiary_link, is_link: true -> still street", () => {
    expect(
      roadClass({ kind: "minor_road", kind_detail: "tertiary_link", is_link: true }),
    ).toBe("street");
  });

  it("kind: minor_road, kind_detail: residential / living_street / pedestrian / service / track / alley -> minor", () => {
    for (const kindDetail of [
      "residential",
      "living_street",
      "pedestrian",
      "service",
      "track",
      "alley",
    ]) {
      expect(roadClass({ kind: "minor_road", kind_detail: kindDetail })).toBe("minor");
    }
  });

  it("kind: minor_road, kind_detail: service, is_link: true -> still minor", () => {
    expect(
      roadClass({ kind: "minor_road", kind_detail: "service", is_link: true }),
    ).toBe("minor");
  });

  it("kind: minor_road, kind_detail anything else or absent -> street", () => {
    expect(roadClass({ kind: "minor_road" })).toBe("street");
  });

  it("kind: pedestrian, any kind_detail -> minor", () => {
    expect(roadClass({ kind: "pedestrian" })).toBe("minor");
    expect(roadClass({ kind: "pedestrian", kind_detail: "footway" })).toBe("minor");
  });

  it("kind: pedestrian, is_link: true -> still minor", () => {
    expect(roadClass({ kind: "pedestrian", is_link: true })).toBe("minor");
  });
});

describe("roadClass -- unknown kind_detail never disappears (test 8)", () => {
  it('kind: minor_road, kind_detail: "something_new" -> street (falls to the middle weight)', () => {
    expect(roadClass({ kind: "minor_road", kind_detail: "something_new" })).toBe("street");
  });

  it('kind: major_road, kind_detail: "something_new" -> arterial', () => {
    expect(roadClass({ kind: "major_road", kind_detail: "something_new" })).toBe("arterial");
  });
});

describe("roadClass -- not drawn (test 9)", () => {
  it("empty props -> null", () => {
    expect(roadClass({})).toBeNull();
  });

  it('kind: "rail" -> null', () => {
    expect(roadClass({ kind: "rail" })).toBeNull();
  });

  it('kind: "path" -> null', () => {
    expect(roadClass({ kind: "path" })).toBeNull();
  });

  it('kind_detail: "runway" -> null', () => {
    expect(roadClass({ kind_detail: "runway" })).toBeNull();
  });

  it('kind: "other", "ferry", "aerialway" -> null', () => {
    expect(roadClass({ kind: "other" })).toBeNull();
    expect(roadClass({ kind: "ferry" })).toBeNull();
    expect(roadClass({ kind: "aerialway" })).toBeNull();
  });

  it('kind_detail: "taxiway" or "pier" -> null', () => {
    expect(roadClass({ kind_detail: "taxiway" })).toBeNull();
    expect(roadClass({ kind_detail: "pier" })).toBeNull();
  });
});

describe("roadClass -- never throws on garbage (test 10)", () => {
  it("kind: 42 (number) -> does not throw, returns null", () => {
    expect(() => roadClass({ kind: 42 })).not.toThrow();
    expect(roadClass({ kind: 42 })).toBeNull();
  });

  it("kind: null -> does not throw, returns null", () => {
    expect(() => roadClass({ kind: null })).not.toThrow();
    expect(roadClass({ kind: null })).toBeNull();
  });

  it("kind: [] (array) -> does not throw, returns null", () => {
    expect(() => roadClass({ kind: [] })).not.toThrow();
    expect(roadClass({ kind: [] })).toBeNull();
  });

  it("kind_detail: garbage type alongside a valid kind -> does not throw", () => {
    expect(() => roadClass({ kind: "minor_road", kind_detail: 42 })).not.toThrow();
    expect(roadClass({ kind: "minor_road", kind_detail: 42 })).toBe("street");
  });
});

describe("PERGAMINO_WEIGHTS -- approved numbers exactly (test 11)", () => {
  it("matches the approved table", () => {
    expect(PERGAMINO_WEIGHTS).toEqual({
      coastline: 1.3,
      major: 2.4,
      arterial: 1.7,
      street: 1.1,
      minor: 0.65,
      river: 1.2,
    });
  });
});

describe("PERGAMINO_LAYERS -- unique ids, correct draw order (test 12)", () => {
  it("has unique ids", () => {
    const ids = PERGAMINO_LAYERS.map((layer) => layer.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("draws earth -> water -> rivers -> minor -> street -> arterial -> major", () => {
    const dataLayers = PERGAMINO_LAYERS.map((layer) => layer.dataLayer);
    const widths = PERGAMINO_LAYERS.map((layer) => layer.widthPx);

    // earth first
    expect(dataLayers[0]).toBe("earth");

    // then water (fill before the river line)
    const waterIndices = dataLayers
      .map((dataLayer, index) => (dataLayer === "water" ? index : -1))
      .filter((index) => index !== -1);
    expect(waterIndices.length).toBe(2);
    const [waterFillIndex, waterLineIndex] = waterIndices;
    expect(waterFillIndex).toBeLessThan(waterLineIndex);

    // then roads, thin (minor) under thick (major)
    const roadIndices = dataLayers
      .map((dataLayer, index) => (dataLayer === "roads" ? index : -1))
      .filter((index) => index !== -1);
    expect(roadIndices.length).toBe(4);
    const roadWidths = roadIndices.map((index) => widths[index]);
    expect(roadWidths).toEqual([
      PERGAMINO_WEIGHTS.minor,
      PERGAMINO_WEIGHTS.street,
      PERGAMINO_WEIGHTS.arterial,
      PERGAMINO_WEIGHTS.major,
    ]);

    // roads come after water, water comes after earth
    expect(Math.min(...waterIndices)).toBeGreaterThan(0);
    expect(Math.min(...roadIndices)).toBeGreaterThan(Math.max(...waterIndices));
  });

  it("the water line layer only matches river/stream kinds", () => {
    const waterLine = PERGAMINO_LAYERS.find(
      (layer) => layer.dataLayer === "water" && layer.geometry === "line",
    );
    expect(waterLine).toBeDefined();
    expect(waterLine?.match?.({ kind: "river" })).toBe(true);
    expect(waterLine?.match?.({ kind: "stream" })).toBe(true);
    expect(waterLine?.match?.({ kind: "ocean" })).toBe(false);
  });

  it("each road layer's match filters by the roadClass it claims to paint", () => {
    const roadMinor = PERGAMINO_LAYERS.find(
      (layer) => layer.dataLayer === "roads" && layer.widthPx === PERGAMINO_WEIGHTS.minor,
    );
    const roadMajor = PERGAMINO_LAYERS.find(
      (layer) => layer.dataLayer === "roads" && layer.widthPx === PERGAMINO_WEIGHTS.major,
    );
    expect(roadMinor?.match?.({ kind: "pedestrian" })).toBe(true);
    expect(roadMinor?.match?.({ kind: "highway" })).toBe(false);
    expect(roadMajor?.match?.({ kind: "highway" })).toBe(true);
    expect(roadMajor?.match?.({ kind: "pedestrian" })).toBe(false);
  });
});

describe("PERGAMINO_LAYERS -- every referenced token is a real palette token (test 4)", () => {
  it("every fillToken/strokeToken referenced by PERGAMINO_LAYERS is a member of PERGAMINO_TOKEN_NAMES", () => {
    const tokenNames = new Set<string>(PERGAMINO_TOKEN_NAMES);

    for (const layer of PERGAMINO_LAYERS) {
      if (layer.fillToken !== undefined) {
        expect(tokenNames.has(layer.fillToken)).toBe(true);
      }
      if (layer.strokeToken !== undefined) {
        expect(tokenNames.has(layer.strokeToken)).toBe(true);
      }
    }
  });
});

describe("landuseGroup -- kind -> one of five groups, or null (Step 2)", () => {
  it("green: park, garden, grass, grassland, forest, nature_reserve, pitch, recreation_ground", () => {
    for (const kind of [
      "park",
      "garden",
      "grass",
      "grassland",
      "forest",
      "nature_reserve",
      "pitch",
      "recreation_ground",
    ]) {
      expect(landuseGroup({ kind })).toBe("green");
    }
  });

  it("civic: hospital, school, university, college, government, military", () => {
    for (const kind of [
      "hospital",
      "school",
      "university",
      "college",
      "government",
      "military",
    ]) {
      expect(landuseGroup({ kind })).toBe("civic");
    }
  });

  it("works: industrial, commercial, retail", () => {
    for (const kind of ["industrial", "commercial", "retail"]) {
      expect(landuseGroup({ kind })).toBe("works");
    }
  });

  it("cemetery: cemetery", () => {
    expect(landuseGroup({ kind: "cemetery" })).toBe("cemetery");
  });

  it("aeroway: aerodrome, airfield, runway, taxiway", () => {
    for (const kind of ["aerodrome", "airfield", "runway", "taxiway"]) {
      expect(landuseGroup({ kind })).toBe("aeroway");
    }
  });

  it("an unrecognised kind never falls into a catch-all -- it is null, not painted", () => {
    expect(landuseGroup({ kind: "residential" })).toBeNull();
    expect(landuseGroup({ kind: "pedestrian" })).toBeNull();
    expect(landuseGroup({ kind: "something_new" })).toBeNull();
  });

  it("empty props, or no kind at all, -> null", () => {
    expect(landuseGroup({})).toBeNull();
  });

  it("never throws on garbage", () => {
    expect(() => landuseGroup({ kind: 42 })).not.toThrow();
    expect(landuseGroup({ kind: 42 })).toBeNull();
    expect(() => landuseGroup({ kind: null })).not.toThrow();
    expect(landuseGroup({ kind: null })).toBeNull();
    expect(() => landuseGroup({ kind: [] })).not.toThrow();
    expect(landuseGroup({ kind: [] })).toBeNull();
  });
});

describe("PERGAMINO_LAYERS -- landuse, buildings, boundaries (Step 2)", () => {
  it("has one layer per landuse group, reading the landuse data layer as polygons", () => {
    const groups = ["green", "civic", "works", "cemetery", "aeroway"] as const;
    for (const group of groups) {
      const layer = PERGAMINO_LAYERS.find((l) => l.id === `landuse-${group}`);
      expect(layer, `landuse-${group} layer missing`).toBeDefined();
      expect(layer?.dataLayer).toBe("landuse");
      expect(layer?.geometry).toBe("polygon");
      expect(layer?.fillToken).toBe(`--color-pergamino-${group}`);
    }
  });

  it("each landuse layer's match agrees with landuseGroup, and only with its own group", () => {
    const groups = ["green", "civic", "works", "cemetery", "aeroway"] as const;
    const sample: Record<(typeof groups)[number], string> = {
      green: "park",
      civic: "hospital",
      works: "industrial",
      cemetery: "cemetery",
      aeroway: "runway",
    };
    for (const group of groups) {
      const layer = PERGAMINO_LAYERS.find((l) => l.id === `landuse-${group}`);
      expect(layer?.match?.({ kind: sample[group] })).toBe(true);
      for (const other of groups) {
        if (other === group) continue;
        expect(layer?.match?.({ kind: sample[other] })).toBe(false);
      }
      expect(layer?.match?.({ kind: "residential" })).toBe(false);
    }
  });

  it("draws buildings from the buildings data layer as polygons, from z14 up, with a fill and a hairline stroke", () => {
    const buildings = PERGAMINO_LAYERS.find((l) => l.id === "buildings");
    expect(buildings).toBeDefined();
    expect(buildings?.dataLayer).toBe("buildings");
    expect(buildings?.geometry).toBe("polygon");
    expect(buildings?.minZoom).toBe(14);
    expect(buildings?.fillToken).toBe("--color-pergamino-building");
    expect(buildings?.strokeToken).toBe("--color-pergamino-building-edge");
    expect(buildings?.widthPx).toBeGreaterThan(0);
  });

  it("draws boundaries from the boundaries data layer as a thin dashed line", () => {
    const boundaries = PERGAMINO_LAYERS.find((l) => l.id === "boundaries");
    expect(boundaries).toBeDefined();
    expect(boundaries?.dataLayer).toBe("boundaries");
    expect(boundaries?.geometry).toBe("line");
    expect(boundaries?.strokeToken).toBe("--color-pergamino-boundary");
    expect(boundaries?.dashPx?.length).toBeGreaterThan(0);
  });

  it("draws landuse, then buildings, then boundaries -- below the roads and above earth/water", () => {
    const ids = PERGAMINO_LAYERS.map((l) => l.id);
    const waterIndices = ids
      .map((id, i) => (id.startsWith("water") ? i : -1))
      .filter((i) => i !== -1);
    const roadIndices = ids
      .map((id, i) => (id.startsWith("road-") ? i : -1))
      .filter((i) => i !== -1);
    const landuseIndices = ["green", "civic", "works", "cemetery", "aeroway"].map((group) =>
      ids.indexOf(`landuse-${group}`),
    );
    const buildingsIndex = ids.indexOf("buildings");
    const boundariesIndex = ids.indexOf("boundaries");

    // landuse -> buildings -> boundaries, in that order
    expect(Math.max(...landuseIndices)).toBeLessThan(buildingsIndex);
    expect(buildingsIndex).toBeLessThan(boundariesIndex);

    // the whole trio sits after earth/water and before the roads
    expect(Math.min(...landuseIndices)).toBeGreaterThan(Math.max(...waterIndices));
    expect(boundariesIndex).toBeLessThan(Math.min(...roadIndices));
  });

  it("still has unique ids with the new layers added", () => {
    const ids = PERGAMINO_LAYERS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("pergamino-style module stays pure -- no Leaflet, no protomaps (test 13)", () => {
  it("the module's own source contains no import from leaflet or protomaps-leaflet", () => {
    const source = readFileSync(
      new URL("../lib/pergamino-style.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["']leaflet["']/);
    expect(source).not.toMatch(/from\s+["']protomaps-leaflet["']/);
    expect(source).not.toMatch(/import\(["']leaflet["']\)/);
    expect(source).not.toMatch(/import\(["']protomaps-leaflet["']\)/);
  });
});

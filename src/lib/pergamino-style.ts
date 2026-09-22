import type { PergaminoTokenName } from "@/lib/pergamino-palette";

/**
 * "Pergamino" -- the ground of the map Zpots draws itself. Pure, dependency-free
 * road classification + draw-order style rules. No Leaflet, no protomaps-leaflet,
 * no DOM: this module must be unit-testable in a plain Node environment.
 *
 * See .claude/prds/pergamino-map.md ("Data model" -> "Ground style") for the
 * approved palette/weights and the road classification table this mirrors.
 */

export type RoadClass = "major" | "arterial" | "street" | "minor";

/** Approved stroke weights (px), exact numbers from the published design preview. */
export const PERGAMINO_WEIGHTS = {
  coastline: 1.3,
  major: 2.4,
  arterial: 1.7,
  street: 1.1,
  minor: 0.65,
  river: 1.2,
} as const;

export interface PergaminoLayer {
  /** Unique id, e.g. "earth" | "water-fill" | "road-major". */
  id: string;
  /** Protomaps tile layer this rule reads from: earth | water | roads | landuse | buildings | boundaries | pois. */
  dataLayer: string;
  /**
   * Which geometry type this rule paints. Load-bearing, not documentation:
   * `buildPaintRules` (BasemapLayer.tsx) turns this into a real filter
   * against the feature's own `geomType`, so a LineString in a polygon
   * data layer (a river closed into a shape, for instance) is rejected
   * before it ever reaches a symbolizer. See pergamino-map.md, "Step 1".
   * "point" was added for the `pois` ground layer (see "Step 3" below) --
   * a `protomaps.CircleSymbolizer`, not Polygon/Line.
   */
  geometry: "polygon" | "line" | "point";
  fillToken?: PergaminoTokenName;
  strokeToken?: PergaminoTokenName;
  widthPx?: number;
  /** Line dash pattern in px (LineSymbolizer's `dash` option), e.g. boundaries. */
  dashPx?: readonly number[];
  /** Circle radius in px (CircleSymbolizer's `radius` option) -- point geometry only. */
  radiusPx?: number;
  minZoom?: number;
  match?: (props: Record<string, unknown>) => boolean;
}

/**
 * kind_detail values that mean "this is not a road at all" (runway/taxiway
 * aprons, piers) regardless of what `kind` says.
 */
const NON_ROAD_KIND_DETAILS = new Set(["runway", "taxiway", "pier"]);

/** `kind` values that are never roads Pergamino draws. */
const EXCLUDED_KINDS = new Set(["other", "path", "rail", "ferry", "aerialway"]);

const MAJOR_ROAD_MAJOR_DETAILS = new Set(["primary", "primary_link"]);
const MINOR_ROAD_STREET_DETAILS = new Set(["tertiary", "tertiary_link", "unclassified"]);
const MINOR_ROAD_MINOR_DETAILS = new Set([
  "residential",
  "living_street",
  "pedestrian",
  "service",
  "track",
  "alley",
]);

/**
 * Maps a Protomaps `roads` layer feature's properties to Pergamino's four
 * stroke classes, or `null` when the feature is not drawn at all (rail,
 * ferry lines, footpaths, runways...). Unknown property values never make a
 * real road vanish: an unrecognised `kind_detail` on a known `kind` falls to
 * that `kind`'s middle weight instead of being dropped (see PRD E12).
 * `is_link` never changes the class -- a link inherits the class of its
 * `kind`. Never throws, regardless of what shape `props` is.
 */
export function roadClass(props: Record<string, unknown>): RoadClass | null {
  const kind = typeof props?.kind === "string" ? props.kind : undefined;
  const kindDetail =
    typeof props?.kind_detail === "string" ? props.kind_detail : undefined;

  if (kindDetail !== undefined && NON_ROAD_KIND_DETAILS.has(kindDetail)) {
    return null;
  }

  if (kind === undefined || EXCLUDED_KINDS.has(kind)) {
    return null;
  }

  if (kind === "highway") {
    return "major";
  }

  if (kind === "major_road") {
    return kindDetail !== undefined && MAJOR_ROAD_MAJOR_DETAILS.has(kindDetail)
      ? "major"
      : "arterial";
  }

  if (kind === "minor_road") {
    if (kindDetail !== undefined && MINOR_ROAD_STREET_DETAILS.has(kindDetail)) {
      return "street";
    }
    if (kindDetail !== undefined && MINOR_ROAD_MINOR_DETAILS.has(kindDetail)) {
      return "minor";
    }
    return "street";
  }

  if (kind === "pedestrian") {
    return "minor";
  }

  return null;
}

/**
 * True for the `water` layer's named line features (rivers, streams) --
 * shared by the `water-line` paint rule below and the matching label rule
 * in `buildLabelRules` (BasemapLayer.tsx), so a river is drawn and named
 * from the same definition of "this is a river line", not two.
 */
export function isWaterLine(props: Record<string, unknown>): boolean {
  const kind = typeof props?.kind === "string" ? props.kind : undefined;
  return kind === "river" || kind === "stream";
}

/**
 * True for a `pois` layer feature carrying a real (non-empty) `name` --
 * the ground dot (Step 3) only marks named points; an unnamed feature
 * (a lone "tree", a "crossing") would just be noise at close zoom. Never
 * throws, regardless of what shape `props` is (mirrors `roadClass`).
 */
export function poiHasName(props: Record<string, unknown>): boolean {
  return typeof props?.name === "string" && props.name.trim().length > 0;
}

/**
 * `pois` layer `kind` values that name a large-scale natural or protected
 * landscape feature -- a forest, a nature reserve, a protected area, a park
 * or garden -- as opposed to a shop, an amenity, or civic infrastructure.
 * Verified directly against the shipped `.pmtiles` archive (a script that
 * walked the tile pyramid, not guesswork): `nature_reserve`, `park`,
 * `protected_area`, `wood` and `garden` all occur as real `pois.kind`
 * values in this archive. `forest` never occurs as a `pois` kind here --
 * it's a `landuse` kind instead (see LANDUSE_GROUP_KINDS's "green" set,
 * which is exactly the bug this fixes: a `landuse` polygon this size can
 * never carry its own name) -- but it's kept anyway, both because a future
 * cut of the archive could tag a `pois` feature that way and because it
 * names Pasonanca Natural Park's own polygon kind. `wetland` was
 * deliberately left out even though it occurs: the only two named wetland
 * pois in this archive are "S1"/"S2" -- codes, not names worth labelling a
 * landscape feature with -- so including it would have meant giving junk
 * data the same treatment as a real place. `garden_centre` (a shop) is
 * excluded on purpose too; it is not the same kind as `garden`.
 */
export const NATURAL_POI_KINDS: ReadonlySet<string> = new Set([
  "nature_reserve",
  "park",
  "protected_area",
  "forest",
  "wood",
  "garden",
]);

/**
 * True for a `pois` layer feature that both carries a real name
 * (poiHasName) and whose `kind` is one of NATURAL_POI_KINDS -- the guard
 * for the large-green-shape naming fix's dedicated label tier
 * (`label-poi-natural` in `buildLabelRules`, BasemapLayer.tsx). Never
 * throws, regardless of what shape `props` is (mirrors poiHasName).
 */
export function isNaturalLandscapePoi(props: Record<string, unknown>): boolean {
  const kind = typeof props?.kind === "string" ? props.kind : undefined;
  return poiHasName(props) && kind !== undefined && NATURAL_POI_KINDS.has(kind);
}

/**
 * The label-tuning fix for very long protected-area/natural names (e.g.
 * "Great and Little Santa Cruz Islands Protected Landscape & Seascape",
 * from this archive's `pois` layer) swamping the map at label-poi-natural's
 * z11 floor -- a ~180km2 shape's name rendering as four-plus stacked lines
 * over a small island is the loudest thing on screen. Two rules, in order:
 *
 * 1. Prefer the part of the name before a recognised protected-area
 *    qualifier phrase ("Protected Landscape", "Natural Park", "Marine
 *    Sanctuary", etc. -- the Philippine NIPAS/OSM vocabulary these names
 *    are drawn from). "Great and Little Santa Cruz Islands Protected
 *    Landscape & Seascape" becomes "Great and Little Santa Cruz Islands" --
 *    still the real, recognisable name, not a truncation artifact.
 * 2. If no qualifier is found (or the qualifier sits at the very start,
 *    leaving nothing before it) and the name still exceeds
 *    NATURAL_POI_NAME_MAX_CHARS, cut at the last whole word inside that
 *    budget and append a single ellipsis character -- never mid-word, and
 *    never silently drops the truncation marker (a bare cut would read as
 *    a complete, different name; the ellipsis is what keeps it honest).
 *
 * A name already at or under the budget is returned unchanged, byte for
 * byte -- most named natural POIs ("Pasonanca Natural Park") are already a
 * reasonable single-line length and this must never touch them.
 */
export const NATURAL_POI_NAME_MAX_CHARS = 32;

const NATURAL_POI_QUALIFIER_PATTERN =
  /\s+(protected\s+(landscape(\s*(and|&)\s*seascape)?|seascape|area)|natural\s+(park|monument|reserve|biotic\s+area)|nature\s+reserve|wildlife\s+sanctuary|marine\s+(park|reserve|sanctuary)|watershed\s+forest\s+reserve|resource\s+reserve)\b/i;

export function shortenNaturalPoiName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= NATURAL_POI_NAME_MAX_CHARS) return trimmed;

  const qualifierMatch = trimmed.match(NATURAL_POI_QUALIFIER_PATTERN);
  if (qualifierMatch?.index) {
    const before = trimmed.slice(0, qualifierMatch.index).trim();
    if (before.length > 0) return before;
  }

  const truncated = trimmed.slice(0, NATURAL_POI_NAME_MAX_CHARS);
  const lastSpace = truncated.lastIndexOf(" ");
  const base = (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trim();
  return `${base}…`;
}

/**
 * The five groups Pergamino's `landuse` layer is painted in (Step 2 --
 * see pergamino-map.md). Five tokens, not one flat fill: an undifferentiated
 * landuse fill would just reproduce the "blob" problem (Step 1) in a new
 * form. A `kind` outside every set below is never painted at all -- an
 * unknown kind rendering as a coloured shape is exactly the bug Step 1 fixed.
 */
export type LanduseGroup = "green" | "civic" | "works" | "cemetery" | "aeroway";

const LANDUSE_GROUP_KINDS: Record<LanduseGroup, ReadonlySet<string>> = {
  green: new Set([
    "park",
    "garden",
    "grass",
    "grassland",
    "forest",
    "nature_reserve",
    "pitch",
    "recreation_ground",
  ]),
  civic: new Set([
    "hospital",
    "school",
    "university",
    "college",
    "government",
    "military",
  ]),
  works: new Set(["industrial", "commercial", "retail"]),
  cemetery: new Set(["cemetery"]),
  aeroway: new Set(["aerodrome", "airfield", "runway", "taxiway"]),
};

const LANDUSE_GROUPS_IN_ORDER = Object.keys(LANDUSE_GROUP_KINDS) as LanduseGroup[];

/**
 * Maps a Protomaps `landuse` layer feature's `kind` to one of the five
 * Pergamino groups, or `null` when it isn't one of the recognised kinds --
 * `null` means "do not paint this feature", not "paint it some default
 * colour". Never throws, regardless of what shape `props` is (mirrors
 * `roadClass`'s contract).
 */
export function landuseGroup(props: Record<string, unknown>): LanduseGroup | null {
  const kind = typeof props?.kind === "string" ? props.kind : undefined;
  if (kind === undefined) return null;

  for (const group of LANDUSE_GROUPS_IN_ORDER) {
    if (LANDUSE_GROUP_KINDS[group].has(kind)) return group;
  }
  return null;
}

/**
 * Draw order, first painted first (bottom) to last (top): earth, then water
 * fill, then rivers, then landuse / buildings / boundaries (below the roads,
 * above the ground -- Step 2), then roads thinnest (minor) to thickest
 * (major) -- thin roads under thick ones, every road over the ground --
 * then, last of all, the named `pois` dots (Step 3), so a point of
 * interest always sits on top of the street it's next to, never under it.
 */
export const PERGAMINO_LAYERS: readonly PergaminoLayer[] = [
  {
    id: "earth",
    dataLayer: "earth",
    geometry: "polygon",
    fillToken: "--color-pergamino-land",
    strokeToken: "--color-pergamino-coast",
    widthPx: PERGAMINO_WEIGHTS.coastline,
  },
  {
    id: "water-fill",
    dataLayer: "water",
    geometry: "polygon",
    fillToken: "--color-pergamino-sea",
  },
  {
    id: "water-line",
    dataLayer: "water",
    geometry: "line",
    strokeToken: "--color-pergamino-river",
    widthPx: PERGAMINO_WEIGHTS.river,
    minZoom: 13,
    match: isWaterLine,
  },
  // Landuse, grouped by kind (Step 2) -- below the roads, above the ground.
  // One PergaminoLayer per group rather than a single flat-filled rule, so
  // an unrecognised kind is simply never matched by any of the five and is
  // never painted, instead of falling into a catch-all colour.
  {
    id: "landuse-green",
    dataLayer: "landuse",
    geometry: "polygon",
    fillToken: "--color-pergamino-green",
    match: (props) => landuseGroup(props) === "green",
  },
  {
    id: "landuse-civic",
    dataLayer: "landuse",
    geometry: "polygon",
    fillToken: "--color-pergamino-civic",
    match: (props) => landuseGroup(props) === "civic",
  },
  {
    id: "landuse-works",
    dataLayer: "landuse",
    geometry: "polygon",
    fillToken: "--color-pergamino-works",
    match: (props) => landuseGroup(props) === "works",
  },
  {
    id: "landuse-cemetery",
    dataLayer: "landuse",
    geometry: "polygon",
    fillToken: "--color-pergamino-cemetery",
    match: (props) => landuseGroup(props) === "cemetery",
  },
  {
    id: "landuse-aeroway",
    dataLayer: "landuse",
    geometry: "polygon",
    fillToken: "--color-pergamino-aeroway",
    match: (props) => landuseGroup(props) === "aeroway",
  },
  // Buildings (Step 2) -- what gives a city map its grain. Fill with a
  // hairline stroke, only from z14 up: at lower zooms a full city's worth
  // of building polygons is just noise, not texture.
  {
    id: "buildings",
    dataLayer: "buildings",
    geometry: "polygon",
    fillToken: "--color-pergamino-building",
    strokeToken: "--color-pergamino-building-edge",
    widthPx: 0.5,
    minZoom: 14,
  },
  // Boundaries (Step 2) -- a thin dashed line, on top of landuse/buildings.
  {
    id: "boundaries",
    dataLayer: "boundaries",
    geometry: "line",
    strokeToken: "--color-pergamino-boundary",
    widthPx: 0.8,
    dashPx: [4, 3],
  },
  {
    id: "road-minor",
    dataLayer: "roads",
    geometry: "line",
    strokeToken: "--color-pergamino-minor",
    widthPx: PERGAMINO_WEIGHTS.minor,
    match: (props) => roadClass(props) === "minor",
  },
  {
    id: "road-street",
    dataLayer: "roads",
    geometry: "line",
    strokeToken: "--color-pergamino-street",
    widthPx: PERGAMINO_WEIGHTS.street,
    match: (props) => roadClass(props) === "street",
  },
  {
    id: "road-arterial",
    dataLayer: "roads",
    geometry: "line",
    strokeToken: "--color-pergamino-arterial",
    widthPx: PERGAMINO_WEIGHTS.arterial,
    match: (props) => roadClass(props) === "arterial",
  },
  {
    id: "road-major",
    dataLayer: "roads",
    geometry: "line",
    strokeToken: "--color-pergamino-major",
    widthPx: PERGAMINO_WEIGHTS.major,
    match: (props) => roadClass(props) === "major",
  },
  // Named points of interest (Step 3 -- the label pass this belongs with,
  // see .claude/prds/pergamino-map.md). A small dot, close zoom only: 361
  // features can land in a single close tile, so this only earns its
  // place once buildings/streets are already legible (minZoom 15) and
  // only for features that actually carry a name -- an unnamed "tree" or
  // "crossing" point would just be noise.
  {
    id: "pois",
    dataLayer: "pois",
    geometry: "point",
    fillToken: "--color-pergamino-poi",
    radiusPx: 1.4,
    minZoom: 15,
    match: poiHasName,
  },
];

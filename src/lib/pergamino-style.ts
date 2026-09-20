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
  /** Protomaps tile layer this rule reads from: earth | water | roads. */
  dataLayer: string;
  geometry: "polygon" | "line";
  fillToken?: PergaminoTokenName;
  strokeToken?: PergaminoTokenName;
  widthPx?: number;
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

function isWaterLine(props: Record<string, unknown>): boolean {
  const kind = typeof props?.kind === "string" ? props.kind : undefined;
  return kind === "river" || kind === "stream";
}

/**
 * Draw order, first painted first (bottom) to last (top): earth, then water
 * fill, then rivers, then roads thinnest (minor) to thickest (major) -- thin
 * roads under thick ones, every road over the ground.
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
];

"use client";

import { useEffect, useState } from "react";
import type { Layer as LeafletLayerInstance, Map as LeafletMap } from "leaflet";
import Leaflet from "leaflet";
import { TileLayer } from "react-leaflet";
import type { Feature, Label, LabelRule, LabelSymbolizer, PaintRule } from "protomaps-leaflet";

import { probeBasemapArchive } from "@/lib/basemap-source";
import {
  BASEMAP_ATTRIBUTION,
  BASEMAP_MAX_DATA_ZOOM,
  BASEMAP_PMTILES_URL,
  TILE_ATTRIBUTION,
  TILE_URL,
} from "@/lib/map-config";
import {
  buildFontLoadTasks,
  readPergaminoFontStack,
  type PergaminoFontStack,
} from "@/lib/pergamino-fonts";
import {
  readPergaminoLabelColors,
  readPergaminoPalette,
  type PergaminoLabelColorName,
  type PergaminoTokenName,
} from "@/lib/pergamino-palette";
import {
  PERGAMINO_LAYERS,
  isNaturalLandscapePoi,
  isWaterLine,
  poiHasName,
  roadClass,
  shortenNaturalPoiName,
} from "@/lib/pergamino-style";

/**
 * "protomaps-leaflet" is ~45kB gzipped and only matters once a live
 * Leaflet map exists (Pergamino PRD D8) -- this type-only import is
 * erased at compile time, so it costs nothing at runtime; the value
 * itself is always `await import()`ed inside the effect below, never at
 * module top level.
 */
type ProtomapsModule = typeof import("protomaps-leaflet");

/**
 * Which basemap actually ended up on the map: the vector "Pergamino"
 * ground drawn from the .pmtiles archive, or the tinted raster fallback
 * (D6) used when the archive can't be read.
 */
export type BasemapMode = "pergamino" | "raster";

interface BasemapLayerProps {
  /**
   * The live Leaflet map instance, or null before one exists (SSR, or a
   * jsdom react-leaflet stand-in that doesn't forward `ref`). D4: this
   * component never calls `useMap()` -- every existing react-leaflet
   * mock in the suite only stubs the handful of methods each component
   * already used, and a new `useMap()` call would throw in all of them.
   */
  map: LeafletMap | null;
  /** Fires exactly once per attach attempt, with the mode that was actually attached. */
  onModeChange?: (mode: BasemapMode) => void;
}

type WindowWithLeaflet = Window & { L?: unknown };

/**
 * `protomaps-leaflet` subclasses `L.GridLayer`, so its vector canvas draws
 * into the very same `.leaflet-tile-pane` the raster fallback's `TileLayer`
 * uses -- there is no separate pane to scope CSS to by selector alone.
 * globals.css's sepia tint exists only to make the *raster* fallback read
 * as Zpots (D6); the vector "Pergamino" ground's colours are chosen
 * outright and must never be filtered. Marking the map's own container
 * (`.leaflet-container`, the ancestor of every pane) with the resolved
 * mode lets globals.css scope `.leaflet-tile-pane`'s filter to
 * `[data-basemap="raster"]` only.
 */
function markContainerBasemapMode(map: LeafletMap, mode: BasemapMode): void {
  map.getContainer().dataset.basemap = mode;
}

/** Cleanup counterpart to markContainerBasemapMode -- unmount or a map-prop
 * identity change must never leave a stale attribute on an old container. */
function clearContainerBasemapMode(map: LeafletMap): void {
  delete map.getContainer().dataset.basemap;
}

/**
 * protomaps-leaflet's Leaflet frontend reads the *global* `L` at
 * `leafletLayer()` call time (`declare const L: any` in its source). It
 * only happens to already exist because Leaflet 1.9.4 ships as a UMD
 * build with no `module`/`exports` field, so bundlers fall back to the
 * build that does `window.L = exports` -- an implicit dependency on a
 * resolution detail, not something to rely on by accident. This sets it
 * explicitly instead, without clobbering a global some other script
 * already provided.
 */
function ensureGlobalLeaflet(): void {
  if (typeof window === "undefined") return;
  const target = window as WindowWithLeaflet;
  if (!target.L) {
    target.L = Leaflet;
  }
}

/**
 * Translates the pure, dependency-free PERGAMINO_LAYERS draw-order
 * descriptors (pergamino-style.ts) into protomaps-leaflet PaintRules,
 * resolving each layer's palette token to a real colour string up front
 * -- canvas `fillStyle`/`strokeStyle` can't read a CSS custom property.
 *
 * Exported (not just used locally) so pergamino-map.md Step 1's fix --
 * a real geometry-type filter -- can be tested directly against the
 * PaintRules it produces, without rendering the component or a real map.
 */
export function buildPaintRules(
  protomaps: ProtomapsModule,
  palette: Record<PergaminoTokenName, string>,
): PaintRule[] {
  return PERGAMINO_LAYERS.map((layer) => {
    const symbolizer =
      layer.geometry === "polygon"
        ? new protomaps.PolygonSymbolizer({
            fill: layer.fillToken ? palette[layer.fillToken] : undefined,
            stroke: layer.strokeToken ? palette[layer.strokeToken] : undefined,
            width: layer.widthPx,
          })
        : layer.geometry === "point"
          ? new protomaps.CircleSymbolizer({
              fill: layer.fillToken ? palette[layer.fillToken] : undefined,
              stroke: layer.strokeToken ? palette[layer.strokeToken] : undefined,
              width: layer.widthPx,
              radius: layer.radiusPx,
            })
          : new protomaps.LineSymbolizer({
              color: layer.strokeToken ? palette[layer.strokeToken] : undefined,
              width: layer.widthPx,
              dash: layer.dashPx ? [...layer.dashPx] : undefined,
            });

    // The "blob bug" fix (pergamino-map.md, Step 1). protomaps-leaflet's
    // painter has no geometry dispatch of its own: it hands every feature
    // in `dataLayer` straight to the symbolizer's `draw()`, and
    // PolygonSymbolizer.draw always does beginPath() -> ... -> fill(),
    // which canvas implicitly closes -- so a LineString in the "water"
    // layer (a river, a strait) was being closed into a shape and filled
    // as sea. The official Protomaps style guards earth/water with
    // `["==", "$type", "Polygon"]`; this is that guard. `layer.match`
    // (pergamino-style.ts) only ever sees a feature's `props`, never its
    // geometry, so the geometry check has to live here, where the real
    // `protomaps.GeomType` enum (Point/Line/Polygon) is available -- it's
    // handed in via the same lazily-imported module `buildPaintRules`
    // already receives, so this stays inside the D8 lazy-load boundary.
    // "point" (Step 3, the `pois` ground dot) extends the same guard.
    const requiredGeomType =
      layer.geometry === "polygon"
        ? protomaps.GeomType.Polygon
        : layer.geometry === "point"
          ? protomaps.GeomType.Point
          : protomaps.GeomType.Line;

    return {
      id: layer.id,
      dataLayer: layer.dataLayer,
      minzoom: layer.minZoom,
      filter: (
        _zoom: number,
        feature: { props: Record<string, unknown>; geomType: number },
      ) => {
        if (feature.geomType !== requiredGeomType) return false;
        // pergamino-style.ts's `match` only needs the feature's own
        // properties; the geometry half of the filter is handled above.
        return layer.match ? layer.match(feature.props) : true;
      },
      symbolizer,
    } as PaintRule;
  });
}

type FeatureFilterArg = { props: Record<string, unknown>; geomType: number };

/**
 * Wraps a LabelSymbolizer so `label-poi-natural` draws
 * `shortenNaturalPoiName(feature.props.name)` instead of the raw archive
 * name (label-tuning defect 1) -- protomaps-leaflet's own TextAttr only
 * ever reads `feature.props[...]` verbatim; there's no options-level hook
 * to transform the text it finds, so the rewrite has to happen here, at
 * the one call site that already sits between the archive's feature and
 * the symbolizer drawing it. Never mutates the tile-cache's own feature
 * object (a fresh shallow clone is passed instead) since that object is
 * shared with whatever else in protomaps-leaflet's paint/label pipeline
 * reads the same parsed tile. Passes the feature through unchanged (same
 * reference) whenever there is nothing to shorten, so this never adds
 * needless allocation to the common case.
 */
// protomaps-leaflet's package root re-exports `Feature`/`Label`/`Layout`
// but not the `Point` type its `place()` geometry argument is made of (it
// stays an internal `@mapbox/point-geometry` detail) -- pulling the whole
// parameter tuple off `LabelSymbolizer["place"]` instead of naming each
// argument's type keeps this wrapper exact without a second, untracked
// dependency on `@mapbox/point-geometry` just for one type.
type PlaceArgs = Parameters<LabelSymbolizer["place"]>;

function withShortenedNaturalPoiName(symbolizer: LabelSymbolizer): LabelSymbolizer {
  return {
    ...symbolizer,
    place(...args: PlaceArgs): Label[] | undefined {
      const [layout, geom, feature] = args;
      const name = feature.props.name;
      if (typeof name !== "string") return symbolizer.place(layout, geom, feature);

      const shortened = shortenNaturalPoiName(name);
      if (shortened === name) return symbolizer.place(layout, geom, feature);

      return symbolizer.place(layout, geom, {
        ...feature,
        props: { ...feature.props, name: shortened },
      } satisfies Feature);
    },
  };
}

/** True for a feature whose `kind` names one of the water layer's named point bodies (sea/bay/ocean/lake/strait). */
const WATER_POINT_KINDS = new Set(["ocean", "bay", "strait", "fjord", "sea", "lake"]);

/**
 * Translates the same source (this time: the tile archive's own names) into
 * protomaps-leaflet LabelRules, using the library's built-in text
 * symbolizers -- which carry their own collision handling (see
 * `node_modules/protomaps-leaflet/src/labeler.ts`'s `Index`), so two
 * labels from different tiers never pile on top of each other the way the
 * old DOM-only curated labels could.
 *
 * This replaces the `labelRules: []` this component used to pass --
 * .claude/prds/pergamino-map.md's original "curated DOM labels only"
 * decision is reversed here; see that PRD's Change Log for why. Every rule
 * below reuses the exact same classification pergamino-style.ts already
 * uses to *paint* the ground (`roadClass`, `isWaterLine`, `poiHasName`),
 * so a road/river/poi is labelled under the same rule it was drawn under,
 * never a second, independently-drifting one.
 *
 * Zoom tiers (never bare between the app's MIN_ZOOM=12 floor and 15,
 * see map-config.ts): settlement + macrohood (barangay-scale) district
 * names from z11, major/arterial street names from z12, river/stream names
 * from z13, minor street names and the finer neighbourhood (subdivision-
 * scale) district names from z14, named points of interest from z15 -- wide
 * view reads as districts, close view reads as streets. Neighbourhood
 * joining at z14 rather than z13, and reading visibly lighter than
 * macrohood once it does, is the label-tuning fix for real barangays
 * (macrohood) getting drowned out by subdivisions (neighbourhood) -- see
 * that rule's own doc comment below for the measured archive counts.
 *
 * One deliberate exception to that z15 POI floor: named natural/protected
 * landscape features (label-poi-natural, isNaturalLandscapePoi) start at
 * z11 instead. A ~180km2 shape like Pasonanca Natural Park dominates the
 * screen at z11-13 -- exactly the zooms the general POI rule doesn't reach
 * -- and the `landuse` layer that actually paints it carries no `name`
 * field of its own (only `["kind", "sort_rank"]`), so the only place its
 * name can come from is this `pois`-layer centroid feature. That tier has
 * no maxzoom, and `label-poi` below excludes natural kinds outright, so a
 * feature like Pasonanca is never labelled twice in two different styles
 * as the view crosses z15 -- it reads as landscape at every zoom, not as a
 * shop past z15.
 */
export function buildLabelRules(
  protomaps: ProtomapsModule,
  fonts: PergaminoFontStack,
  labelColors: Record<PergaminoLabelColorName, string>,
): LabelRule[] {
  const ink = labelColors["--color-ink"];
  const stoneDeep = labelColors["--color-stone-deep"];
  const tealDeep = labelColors["--color-teal-deep"];
  const cream = labelColors["--color-cream"];
  const forestDeep = labelColors["--color-forest-deep"];

  return [
    // Settlement -- "Zamboanga City" itself (places.kind === "locality").
    {
      id: "label-settlement",
      dataLayer: "places",
      symbolizer: new protomaps.CenteredTextSymbolizer({
        font: `600 13px ${fonts.wordmark}`,
        textTransform: "uppercase",
        letterSpacing: 1.6,
        fill: ink,
        stroke: cream,
        width: 2.5,
      }),
      filter: (_zoom: number, feature: FeatureFilterArg) =>
        feature.props.kind === "locality",
    },
    // Districts -- places.kind "macrohood" (barangay/quarter-scale, e.g.
    // "Baliwasan", "Zone I") then the finer "neighbourhood" -- the real
    // barangay names the curated list used to hand-guess coordinates for.
    {
      id: "label-district-macrohood",
      dataLayer: "places",
      minzoom: 11,
      symbolizer: new protomaps.CenteredTextSymbolizer({
        font: `500 10px ${fonts.body}`,
        textTransform: "uppercase",
        letterSpacing: 1.4,
        fill: stoneDeep,
        stroke: cream,
        width: 2,
      }),
      filter: (_zoom: number, feature: FeatureFilterArg) =>
        feature.props.kind === "macrohood",
    },
    // Pushed to z14, one zoom later than macrohood's z11, and drawn
    // visibly lighter (label-tuning defect 2): decoding
    // public/basemap/zamboanga.pmtiles's `places` layer showed neighbourhood
    // features (subdivisions -- "Sanbof Subdivision", "Southcom Village")
    // outnumbering macrohood (real barangays -- "Tetuan", "Putik", "Guiwan")
    // by roughly 6 to 1 at z13 (187 vs 32 in view), and the archive's own
    // `min_zoom` is a flat 13 across every in-view neighbourhood feature (no
    // per-feature grading to "honour" here -- see .claude/prds/pergamino-map.md's
    // Change Log for the full measured counts). Giving macrohood a full zoom
    // level on its own, then drawing neighbourhood smaller/lighter/tighter
    // once it joins, is what makes the reading order legible at z13-z14
    // rather than just moving the same collision one zoom later.
    {
      id: "label-district-neighbourhood",
      dataLayer: "places",
      minzoom: 14,
      symbolizer: new protomaps.CenteredTextSymbolizer({
        font: `400 8.5px ${fonts.body}`,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        fill: stoneDeep,
        stroke: cream,
        width: 1.5,
      }),
      filter: (_zoom: number, feature: FeatureFilterArg) =>
        feature.props.kind === "neighbourhood",
    },
    // Streets -- reuses roadClass (pergamino-style.ts) so a road is
    // labelled under the exact class it was painted under. Major/arterial
    // read from z12; street/minor only once the view is close (z14).
    {
      id: "label-road-major",
      dataLayer: "roads",
      minzoom: 12,
      symbolizer: new protomaps.LineLabelSymbolizer({
        font: `500 11px ${fonts.body}`,
        fill: stoneDeep,
        stroke: cream,
        width: 2,
      }),
      filter: (_zoom: number, feature: FeatureFilterArg) => {
        const cls = roadClass(feature.props);
        return cls === "major" || cls === "arterial";
      },
    },
    {
      id: "label-road-minor",
      dataLayer: "roads",
      minzoom: 14,
      symbolizer: new protomaps.LineLabelSymbolizer({
        font: `400 10px ${fonts.body}`,
        fill: stoneDeep,
        stroke: cream,
        width: 1.5,
      }),
      filter: (_zoom: number, feature: FeatureFilterArg) => {
        const cls = roadClass(feature.props);
        return cls === "street" || cls === "minor";
      },
    },
    // Water -- named rivers/streams (line geometry) from z13, matching the
    // water-line paint layer's own minZoom; named seas/bays/straits (point
    // geometry) whenever the archive carries one, no floor of its own.
    {
      id: "label-water-line",
      dataLayer: "water",
      minzoom: 13,
      symbolizer: new protomaps.LineLabelSymbolizer({
        font: `italic 500 11px ${fonts.display}`,
        fill: tealDeep,
        stroke: cream,
        width: 1.5,
      }),
      filter: (_zoom: number, feature: FeatureFilterArg) =>
        feature.geomType === protomaps.GeomType.Line && isWaterLine(feature.props),
    },
    {
      id: "label-water-point",
      dataLayer: "water",
      symbolizer: new protomaps.CenteredTextSymbolizer({
        font: `italic 500 13px ${fonts.display}`,
        letterSpacing: 2,
        fill: tealDeep,
        stroke: cream,
        width: 2,
      }),
      filter: (_zoom: number, feature: FeatureFilterArg) =>
        feature.geomType === protomaps.GeomType.Point &&
        WATER_POINT_KINDS.has(String(feature.props.kind)),
    },
    // Named natural/protected landscape points -- nature_reserve, park,
    // protected_area, forest, wood, garden (NATURAL_POI_KINDS,
    // pergamino-style.ts). From z11, not z15: this is the fix for a large
    // named natural feature (e.g. Pasonanca Natural Park) having no label
    // at the zooms where it actually dominates the screen -- see the
    // module doc comment above. Alegreya italic, like the water tier, but
    // in forestDeep rather than tealDeep so a landscape name reads as
    // landscape, not as water.
    {
      id: "label-poi-natural",
      dataLayer: "pois",
      minzoom: 11,
      // withShortenedNaturalPoiName: caps very long protected-area/natural
      // names (label-tuning defect 1) -- see shortenNaturalPoiName's own
      // doc comment in pergamino-style.ts for the rule.
      symbolizer: withShortenedNaturalPoiName(
        new protomaps.CenteredTextSymbolizer({
          font: `italic 500 12px ${fonts.display}`,
          letterSpacing: 1.2,
          fill: forestDeep,
          stroke: cream,
          width: 2,
        }),
      ),
      filter: (_zoom: number, feature: FeatureFilterArg) =>
        feature.geomType === protomaps.GeomType.Point && isNaturalLandscapePoi(feature.props),
    },
    // Every other point of interest -- close zoom only (minZoom 15,
    // matches the `pois` ground dot in pergamino-style.ts), named
    // (poiHasName) and *not* one of the natural kinds label-poi-natural
    // already owns above -- otherwise a feature like Pasonanca Natural
    // Park would be labelled twice, once per tier, in two different
    // styles, once the view reached z15.
    {
      id: "label-poi",
      dataLayer: "pois",
      minzoom: 15,
      symbolizer: new protomaps.OffsetTextSymbolizer({
        font: `600 10px ${fonts.wordmark}`,
        textTransform: "uppercase",
        letterSpacing: 1,
        fill: ink,
        stroke: cream,
        width: 1.5,
        offsetY: 4,
        placements: [protomaps.TextPlacements.S],
      }),
      filter: (_zoom: number, feature: FeatureFilterArg) =>
        feature.geomType === protomaps.GeomType.Point &&
        poiHasName(feature.props) &&
        !isNaturalLandscapePoi(feature.props),
    },
  ];
}

/**
 * Adds the "Pergamino" vector basemap once `map` exists: probes the
 * `.pmtiles` archive and lazily imports protomaps-leaflet in parallel
 * (D8), then either attaches the vector layer imperatively via `map`, or
 * falls back to the tinted raster `TileLayer` (D6) when the archive
 * can't be read. Renders nothing while `map` is null or while the probe
 * is still pending -- the vector layer is added imperatively, not
 * through react-leaflet, so there is nothing declarative to render for it.
 */
export default function BasemapLayer({ map, onModeChange }: BasemapLayerProps) {
  const [mode, setMode] = useState<BasemapMode | null>(null);

  useEffect(() => {
    if (!map) return;

    // Narrowed once into its own const: TS's flow narrowing of `map` above
    // doesn't persist into the nested `attach` closure below.
    const currentMap = map;

    let cancelled = false;
    let attachedLayer: LeafletLayerInstance | null = null;

    ensureGlobalLeaflet();

    // Lands the component in the same state a failed probe already
    // produces: the tinted raster TileLayer, with onModeChange("raster")
    // fired exactly once. Shared by the failed-probe branch and the
    // catch below so a rejected `import("protomaps-leaflet")` -- a CDN
    // blip, an ad blocker, a stale chunk after a redeploy -- never leaves
    // the user looking at a blank map instead of the old one.
    function fallBackToRaster() {
      if (cancelled) return;
      setMode("raster");
      markContainerBasemapMode(currentMap, "raster");
      onModeChange?.("raster");
    }

    async function attach() {
      try {
        const [probeResult, protomaps] = await Promise.all([
          probeBasemapArchive(BASEMAP_PMTILES_URL),
          import("protomaps-leaflet"),
        ]);

        if (cancelled) return;

        if (probeResult === "unavailable") {
          fallBackToRaster();
          return;
        }

        const palette = readPergaminoPalette();
        const labelColors = readPergaminoLabelColors();
        const fonts = readPergaminoFontStack();
        const paintRules = buildPaintRules(protomaps, palette);
        const labelRules = buildLabelRules(protomaps, fonts, labelColors);

        // The webfont race (see pergamino-fonts.ts): protomaps-leaflet
        // awaits every one of these before it lays out a tile's labels --
        // on every tile render, not just the first -- so a tile painted
        // before Cinzel/Alegreya finished loading waits instead of
        // locking in a fallback face for good. protomaps-leaflet's own
        // `Status` type (leaflet.ts) exists only so it can label a
        // fulfilled-vs-rejected result internally (`reflect()`); it never
        // inspects a task's resolved *value*, so `Promise<unknown>` is
        // safe here -- this cast, not `document.fonts.load`'s return
        // type, is what would need to change if that stopped being true.
        const tasks = buildFontLoadTasks(fonts) as unknown as NonNullable<
          Parameters<typeof protomaps.leafletLayer>[0]
        >["tasks"];

        // The dynamically-imported module's own return type structurally
        // matches Leaflet's Layer (it extends L.GridLayer internally), but
        // crossing a lazily-imported third-party boundary is exactly the
        // place an explicit cast belongs rather than fighting inference.
        const layer = protomaps.leafletLayer({
          url: BASEMAP_PMTILES_URL,
          paintRules,
          labelRules,
          tasks,
          maxDataZoom: BASEMAP_MAX_DATA_ZOOM,
          attribution: BASEMAP_ATTRIBUTION,
          backgroundColor: palette["--color-pergamino-sea"],
        }) as unknown as LeafletLayerInstance;

        if (cancelled) return;

        layer.addTo(currentMap);
        attachedLayer = layer;
        setMode("pergamino");
        markContainerBasemapMode(currentMap, "pergamino");
        onModeChange?.("pergamino");
      } catch (error) {
        // probeBasemapArchive never throws (it resolves "unavailable"
        // instead), so a rejection here can only be the dynamic import --
        // or, defensively, anything else unexpected during attach. Logged
        // only while still mounted (same guard fallBackToRaster already
        // applies) so a genuine implementation bug stays discoverable
        // without spamming the console for a rejection that arrives after
        // teardown.
        if (!cancelled) {
          console.error("BasemapLayer: falling back to raster basemap", error);
        }
        fallBackToRaster();
      }
    }

    attach();

    return () => {
      cancelled = true;
      if (attachedLayer) {
        currentMap.removeLayer(attachedLayer);
      }
      clearContainerBasemapMode(currentMap);
    };
    // onModeChange is a callback prop, not reactive state this effect
    // should tear down and re-run for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  if (mode === "raster") {
    return <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />;
  }

  return null;
}

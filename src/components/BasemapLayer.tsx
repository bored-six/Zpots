"use client";

import { useEffect, useState } from "react";
import type { Layer as LeafletLayerInstance, Map as LeafletMap } from "leaflet";
import Leaflet from "leaflet";
import { TileLayer } from "react-leaflet";
import type { PaintRule } from "protomaps-leaflet";

import { probeBasemapArchive } from "@/lib/basemap-source";
import {
  BASEMAP_ATTRIBUTION,
  BASEMAP_MAX_DATA_ZOOM,
  BASEMAP_PMTILES_URL,
  TILE_ATTRIBUTION,
  TILE_URL,
} from "@/lib/map-config";
import { readPergaminoPalette, type PergaminoTokenName } from "@/lib/pergamino-palette";
import { PERGAMINO_LAYERS } from "@/lib/pergamino-style";

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
    const requiredGeomType =
      layer.geometry === "polygon" ? protomaps.GeomType.Polygon : protomaps.GeomType.Line;

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
        const paintRules = buildPaintRules(protomaps, palette);

        // The dynamically-imported module's own return type structurally
        // matches Leaflet's Layer (it extends L.GridLayer internally), but
        // crossing a lazily-imported third-party boundary is exactly the
        // place an explicit cast belongs rather than fighting inference.
        const layer = protomaps.leafletLayer({
          url: BASEMAP_PMTILES_URL,
          paintRules,
          labelRules: [],
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

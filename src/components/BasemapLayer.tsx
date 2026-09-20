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
 */
function buildPaintRules(
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
          });

    return {
      id: layer.id,
      dataLayer: layer.dataLayer,
      minzoom: layer.minZoom,
      // pergamino-style.ts's `match` only needs the feature's own
      // properties; protomaps-leaflet's own Filter type also passes zoom.
      filter: layer.match
        ? (_zoom: number, feature: { props: Record<string, unknown> }) =>
            layer.match!(feature.props)
        : undefined,
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

    async function attach() {
      const [probeResult, protomaps] = await Promise.all([
        probeBasemapArchive(BASEMAP_PMTILES_URL),
        import("protomaps-leaflet"),
      ]);

      if (cancelled) return;

      if (probeResult === "unavailable") {
        setMode("raster");
        onModeChange?.("raster");
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
      onModeChange?.("pergamino");
    }

    attach();

    return () => {
      cancelled = true;
      if (attachedLayer) {
        currentMap.removeLayer(attachedLayer);
      }
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

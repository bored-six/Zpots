import { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Map as LeafletMap } from "leaflet";
import Leaflet from "leaflet";

/**
 * Pergamino PRD, T2.1 (tests 38-47). BasemapLayer takes the live Leaflet
 * map as an explicit prop (D4 -- no useMap(), so none of the nine existing
 * react-leaflet mocks across the suite need to change) and lazily
 * `await import()`s protomaps-leaflet inside its effect (D8), so it is
 * mocked here the same way -- via `vi.mock("protomaps-leaflet", ...)` --
 * rather than as a static dependency.
 */

const {
  leafletLayerMock,
  PolygonSymbolizerMock,
  LineSymbolizerMock,
  CircleSymbolizerMock,
  CenteredTextSymbolizerMock,
  LineLabelSymbolizerMock,
  OffsetTextSymbolizerMock,
} = vi.hoisted(() => ({
  leafletLayerMock: vi.fn(),
  PolygonSymbolizerMock: vi.fn(),
  LineSymbolizerMock: vi.fn(),
  CircleSymbolizerMock: vi.fn(),
  CenteredTextSymbolizerMock: vi.fn(),
  LineLabelSymbolizerMock: vi.fn(),
  OffsetTextSymbolizerMock: vi.fn(),
}));

vi.mock("protomaps-leaflet", () => ({
  leafletLayer: leafletLayerMock,
  PolygonSymbolizer: PolygonSymbolizerMock,
  LineSymbolizer: LineSymbolizerMock,
  // The pois ground dot (Step 3) and the four label symbolizers
  // buildLabelRules uses -- an unfaithful mock without these would throw
  // "is not a constructor" the moment buildPaintRules/buildLabelRules run,
  // not silently pass with the wrong basemap mode.
  CircleSymbolizer: CircleSymbolizerMock,
  CenteredTextSymbolizer: CenteredTextSymbolizerMock,
  LineLabelSymbolizer: LineLabelSymbolizerMock,
  OffsetTextSymbolizer: OffsetTextSymbolizerMock,
  // Real numeric values (symbolizer.ts).
  TextPlacements: { N: 1, Ne: 2, E: 3, Se: 4, S: 5, Sw: 6, W: 7, Nw: 8 },
  // Real numeric values (tilecache.ts): Point=1, Line=2, Polygon=3.
  // buildPaintRules reads this off the module to build its geometry-type
  // filter (pergamino-map.md, "Step 1") -- an unfaithful mock without it
  // would throw the moment buildPaintRules runs, not silently pass.
  GeomType: { Point: 1, Line: 2, Polygon: 3 },
}));

const { probeMock } = vi.hoisted(() => ({ probeMock: vi.fn() }));

vi.mock("@/lib/basemap-source", () => ({ probeBasemapArchive: probeMock }));

vi.mock("react-leaflet", () => ({
  TileLayer: (props: { url: unknown; attribution: unknown }) => (
    <div
      data-testid="tile-layer"
      data-url={String(props.url)}
      data-attribution={String(props.attribution)}
    />
  ),
}));

import * as protomapsLeaflet from "protomaps-leaflet";

import BasemapLayer, { buildLabelRules } from "@/components/BasemapLayer";
import { PERGAMINO_FONT_FALLBACK } from "@/lib/pergamino-fonts";
import { PERGAMINO_FALLBACK_HEX, PERGAMINO_LABEL_FALLBACK_HEX } from "@/lib/pergamino-palette";
import { PERGAMINO_LAYERS } from "@/lib/pergamino-style";
import {
  BASEMAP_ATTRIBUTION,
  BASEMAP_MAX_DATA_ZOOM,
  BASEMAP_PMTILES_URL,
  TILE_ATTRIBUTION,
  TILE_URL,
} from "@/lib/map-config";

type FakeMap = LeafletMap & { addLayer: ReturnType<typeof vi.fn>; removeLayer: ReturnType<typeof vi.fn> };

/** A hand-written fake map recording addLayer/removeLayer -- no real Leaflet map in jsdom.
 * getContainer() returns a real DOM element so BasemapLayer's data-basemap
 * marking (see BasemapLayer.container-attr.test.tsx) has something to write to. */
function createFakeMap(): FakeMap {
  const container = document.createElement("div");
  return {
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    getContainer: () => container,
  } as unknown as FakeMap;
}

/** Deferred promise so a test can control exactly when the probe settles. */
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  leafletLayerMock.mockReset();
  leafletLayerMock.mockImplementation((options: Record<string, unknown>) => {
    const layer = {
      options,
      addTo: vi.fn((map: FakeMap) => {
        map.addLayer(layer);
        return layer;
      }),
    };
    return layer;
  });
  PolygonSymbolizerMock.mockReset();
  LineSymbolizerMock.mockReset();
  CircleSymbolizerMock.mockReset();
  CenteredTextSymbolizerMock.mockReset();
  LineLabelSymbolizerMock.mockReset();
  OffsetTextSymbolizerMock.mockReset();
  probeMock.mockReset();
});

afterEach(() => {
  cleanup();
  delete (window as Window & { L?: unknown }).L;
});

describe("BasemapLayer", () => {
  it("map === null renders nothing, calls no probe, and never calls leafletLayer", async () => {
    const { container } = render(<BasemapLayer map={null} />);
    await flushMicrotasks();

    expect(container).toBeEmptyDOMElement();
    expect(probeMock).not.toHaveBeenCalled();
    expect(leafletLayerMock).not.toHaveBeenCalled();
  });

  it('probe "ok" calls leafletLayer exactly once with the PRD-specified options', async () => {
    probeMock.mockResolvedValue("ok");
    const map = createFakeMap();

    render(<BasemapLayer map={map} />);

    await waitFor(() => expect(leafletLayerMock).toHaveBeenCalledTimes(1));

    const options = leafletLayerMock.mock.calls[0][0] as Record<string, unknown>;
    expect(options.url).toBe(BASEMAP_PMTILES_URL);
    // labelRules: [] used to be the whole bug report (pergamino-map.md's
    // labels reversal) -- it now carries one LabelRule per
    // buildLabelRules tier, resolved with the same jsdom font/colour
    // fallbacks BasemapLayer itself falls back to.
    expect(Array.isArray(options.labelRules)).toBe(true);
    const expectedLabelRules = buildLabelRules(
      protomapsLeaflet,
      PERGAMINO_FONT_FALLBACK,
      PERGAMINO_LABEL_FALLBACK_HEX,
    );
    expect((options.labelRules as unknown[]).length).toBe(expectedLabelRules.length);
    expect((options.labelRules as unknown[]).length).toBeGreaterThan(0);
    // The webfont race fix: BasemapLayer hands protomaps-leaflet one
    // `document.fonts.load(...)` task per face buildLabelRules draws
    // with. jsdom has no CSS Font Loading API, so buildFontLoadTasks
    // degrades to [] here -- verified directly, not assumed (see
    // pergamino-fonts.test.ts) -- which is itself the guard this test
    // locks in: `tasks` must never throw or be omitted.
    expect(options.tasks).toEqual([]);
    expect(options.maxDataZoom).toBe(BASEMAP_MAX_DATA_ZOOM);
    expect(options.attribution).toBe(BASEMAP_ATTRIBUTION);
    expect(options.backgroundColor).toBe(PERGAMINO_FALLBACK_HEX["--color-pergamino-sea"]);
    expect(Array.isArray(options.paintRules)).toBe(true);
    expect((options.paintRules as unknown[]).length).toBe(PERGAMINO_LAYERS.length);
  });

  it('probe "ok" renders no TileLayer and calls onModeChange("pergamino") exactly once', async () => {
    probeMock.mockResolvedValue("ok");
    const map = createFakeMap();
    const onModeChange = vi.fn();

    render(<BasemapLayer map={map} onModeChange={onModeChange} />);

    await waitFor(() => expect(onModeChange).toHaveBeenCalledTimes(1));
    expect(onModeChange).toHaveBeenCalledWith("pergamino");
    expect(screen.queryByTestId("tile-layer")).toBeNull();
  });

  it('probe "unavailable" renders the raster TileLayer fallback, never calls leafletLayer, and calls onModeChange("raster") exactly once', async () => {
    probeMock.mockResolvedValue("unavailable");
    const map = createFakeMap();
    const onModeChange = vi.fn();

    render(<BasemapLayer map={map} onModeChange={onModeChange} />);

    const tile = await screen.findByTestId("tile-layer");
    expect(tile.getAttribute("data-url")).toBe(TILE_URL);
    expect(tile.getAttribute("data-attribution")).toBe(TILE_ATTRIBUTION);
    expect(leafletLayerMock).not.toHaveBeenCalled();
    expect(onModeChange).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenCalledWith("raster");
  });

  it("unmounting before the probe resolves never calls addLayer, and logs no unmounted-component warning", async () => {
    const deferred = createDeferred<"ok" | "unavailable">();
    probeMock.mockReturnValue(deferred.promise);
    const map = createFakeMap();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const { unmount } = render(<BasemapLayer map={map} />);
    unmount();
    deferred.resolve("ok");
    await flushMicrotasks();

    expect(map.addLayer).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("unmounting after the layer is added calls map.removeLayer exactly once with that same layer instance", async () => {
    probeMock.mockResolvedValue("ok");
    const map = createFakeMap();

    const { unmount } = render(<BasemapLayer map={map} />);
    await waitFor(() => expect(map.addLayer).toHaveBeenCalledTimes(1));
    const addedLayer = map.addLayer.mock.calls[0][0];

    unmount();

    expect(map.removeLayer).toHaveBeenCalledTimes(1);
    expect(map.removeLayer).toHaveBeenCalledWith(addedLayer);
  });

  it("changing the map prop's identity removes the old layer before the new one is added -- never two layers at once", async () => {
    probeMock.mockResolvedValue("ok");
    const mapA = createFakeMap();
    const mapB = createFakeMap();

    const { rerender } = render(<BasemapLayer map={mapA} />);
    await waitFor(() => expect(mapA.addLayer).toHaveBeenCalledTimes(1));
    const layerA = mapA.addLayer.mock.calls[0][0];

    rerender(<BasemapLayer map={mapB} />);

    // Teardown of the old layer must happen synchronously with the map
    // change, before the new map's async attach has any chance to resolve.
    expect(mapA.removeLayer).toHaveBeenCalledTimes(1);
    expect(mapA.removeLayer).toHaveBeenCalledWith(layerA);
    expect(mapB.addLayer).not.toHaveBeenCalled();

    await waitFor(() => expect(mapB.addLayer).toHaveBeenCalledTimes(1));
  });

  it("mounting twice (React StrictMode double-invoke) leaves exactly one layer attached", async () => {
    probeMock.mockResolvedValue("ok");
    const map = createFakeMap();

    render(
      <StrictMode>
        <BasemapLayer map={map} />
      </StrictMode>,
    );

    await waitFor(() => expect(map.addLayer).toHaveBeenCalledTimes(1));
    await flushMicrotasks();
    expect(map.addLayer).toHaveBeenCalledTimes(1);
  });

  it("sets window.L when it is missing", async () => {
    delete (window as Window & { L?: unknown }).L;
    probeMock.mockResolvedValue("unavailable");
    const map = createFakeMap();

    render(<BasemapLayer map={map} />);

    await waitFor(() => expect((window as Window & { L?: unknown }).L).toBeDefined());
    expect((window as Window & { L?: unknown }).L).toBe(Leaflet);
  });

  it("leaves an existing window.L untouched", async () => {
    const sentinel = { sentinel: true };
    (window as Window & { L?: unknown }).L = sentinel;
    probeMock.mockResolvedValue("ok");
    const map = createFakeMap();

    render(<BasemapLayer map={map} />);

    await waitFor(() => expect(leafletLayerMock).toHaveBeenCalledTimes(1));
    expect((window as Window & { L?: unknown }).L).toBe(sentinel);
  });

  it("BASEMAP_ATTRIBUTION names OpenStreetMap and links to the copyright page", () => {
    expect(BASEMAP_ATTRIBUTION).toContain("OpenStreetMap");
    expect(BASEMAP_ATTRIBUTION).toContain("https://www.openstreetmap.org/copyright");
  });
});

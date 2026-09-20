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

const { leafletLayerMock, PolygonSymbolizerMock, LineSymbolizerMock } = vi.hoisted(() => ({
  leafletLayerMock: vi.fn(),
  PolygonSymbolizerMock: vi.fn(),
  LineSymbolizerMock: vi.fn(),
}));

vi.mock("protomaps-leaflet", () => ({
  leafletLayer: leafletLayerMock,
  PolygonSymbolizer: PolygonSymbolizerMock,
  LineSymbolizer: LineSymbolizerMock,
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

import BasemapLayer from "@/components/BasemapLayer";
import { PERGAMINO_FALLBACK_HEX } from "@/lib/pergamino-palette";
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
    expect(options.labelRules).toEqual([]);
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

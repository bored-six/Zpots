import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Map as LeafletMap } from "leaflet";

/**
 * Live-verification bug fix: `protomaps-leaflet` subclasses `L.GridLayer`,
 * so its vector canvas renders inside the same `.leaflet-tile-pane` the
 * raster fallback's `TileLayer` uses. globals.css's sepia tint was unscoped
 * and was tinting the vector ground too. The fix has `BasemapLayer` mark
 * `map.getContainer()` with `data-basemap="raster"` or
 * `data-basemap="pergamino"` so globals.css can scope the tint to the
 * raster case only (see tile-tint-scoping.test.tsx for the CSS-side half
 * of this contract). This file proves BasemapLayer itself sets, updates,
 * and cleans up that attribute correctly -- same mocking pattern as
 * BasemapLayer.test.tsx.
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
  // Real numeric values (tilecache.ts): Point=1, Line=2, Polygon=3 --
  // buildPaintRules' geometry-type filter reads this off the module.
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

import BasemapLayer from "@/components/BasemapLayer";

type FakeMap = LeafletMap & {
  addLayer: ReturnType<typeof vi.fn>;
  removeLayer: ReturnType<typeof vi.fn>;
  getContainer: () => HTMLDivElement;
};

/** Same fake map as BasemapLayer.test.tsx, plus a real DOM container so
 * `getContainer()`'s dataset can be asserted on directly. */
function createFakeMap(): FakeMap {
  const container = document.createElement("div");
  return {
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    getContainer: () => container,
  } as unknown as FakeMap;
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

describe("BasemapLayer marks its map container with the resolved mode", () => {
  it('sets data-basemap="pergamino" on the container once the vector layer attaches', async () => {
    probeMock.mockResolvedValue("ok");
    const map = createFakeMap();

    render(<BasemapLayer map={map} />);

    await waitFor(() => expect(map.getContainer().dataset.basemap).toBe("pergamino"));
  });

  it('sets data-basemap="raster" on the container when the probe reports "unavailable"', async () => {
    probeMock.mockResolvedValue("unavailable");
    const map = createFakeMap();

    render(<BasemapLayer map={map} />);

    await waitFor(() => expect(map.getContainer().dataset.basemap).toBe("raster"));
  });

  it("the container carries no data-basemap attribute before the probe resolves", async () => {
    probeMock.mockReturnValue(new Promise(() => {})); // never resolves
    const map = createFakeMap();

    render(<BasemapLayer map={map} />);

    expect(map.getContainer().dataset.basemap).toBeUndefined();
  });

  it("clears data-basemap from the container on unmount", async () => {
    probeMock.mockResolvedValue("ok");
    const map = createFakeMap();

    const { unmount } = render(<BasemapLayer map={map} />);
    await waitFor(() => expect(map.getContainer().dataset.basemap).toBe("pergamino"));

    unmount();

    expect(map.getContainer().dataset.basemap).toBeUndefined();
  });

  it("clears the old container's attribute and sets the new one's when the map prop's identity changes", async () => {
    probeMock.mockResolvedValue("ok");
    const mapA = createFakeMap();
    const mapB = createFakeMap();

    const { rerender } = render(<BasemapLayer map={mapA} />);
    await waitFor(() => expect(mapA.getContainer().dataset.basemap).toBe("pergamino"));

    rerender(<BasemapLayer map={mapB} />);

    expect(mapA.getContainer().dataset.basemap).toBeUndefined();
    await waitFor(() => expect(mapB.getContainer().dataset.basemap).toBe("pergamino"));
  });
});

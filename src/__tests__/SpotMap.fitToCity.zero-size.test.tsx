import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CITY_OUTLINE_BOUNDS } from "@/lib/city-outline";

/**
 * Regression coverage for the same "Invalid LatLng object: (NaN, NaN)"
 * crash `MapInset.test.tsx` covers for `flyTo`, but on `fitBounds`'s side
 * instead: `Map#getBoundsZoom` divides by the container's pixel size too,
 * and a 0x0 container makes that NaN just the same. Mi mapa's `fitToCity`
 * (`SpotMap.tsx`) is the one caller of `fitBounds` that runs unconditionally
 * on mount, so it's the one most likely to still be racing a not-yet-laid-
 * out container. `sizeRef` lets a test flip what `getSize()` reports
 * without needing a fresh mock per test.
 */
const { fakeMap, sizeRef } = vi.hoisted(() => ({
  sizeRef: { current: { x: 800, y: 600 } },
  fakeMap: {
    on: vi.fn(),
    off: vi.fn(),
    setMaxBounds: vi.fn(),
    fitBounds: vi.fn(),
    invalidateSize: vi.fn(),
    getSize: vi.fn(),
    // PlaceLabelsLayer (and BasemapLayer) take the live map as a plain
    // `map` prop rather than `useMap()` -- see PlaceLabelsLayer.tsx's own
    // comment -- so it's this forwarded-ref fake, not react-leaflet's
    // `useMap()` mock below, that needs the imperative pane/layer API a
    // real `L.Map` provides. Same shape as SpotMap.city.test.tsx's
    // `useMap()` stand-in.
    getPane: vi.fn(() => ({ style: {} }) as unknown as HTMLElement),
    createPane: vi.fn(() => ({ style: {} }) as unknown as HTMLElement),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    getZoom: vi.fn(() => 14),
  },
}));

vi.mock("react-leaflet", async () => {
  const React = await import("react");
  return {
    MapContainer: React.forwardRef(function MockMapContainer(
      { children }: { children?: React.ReactNode },
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => fakeMap);
      return <div data-testid="map-container">{children}</div>;
    }),
    TileLayer: () => <div data-testid="tile-layer" />,
    Marker: ({ children }: { children?: React.ReactNode }) => <div data-testid="marker">{children}</div>,
    Popup: ({ children }: { children?: React.ReactNode }) => <div data-testid="popup">{children}</div>,
    Polygon: () => <div data-testid="polygon" />,
    Polyline: () => <div data-testid="polyline" />,
    useMap: () => ({
      createPane: vi.fn(() => ({ style: {} }) as unknown as HTMLElement),
      getPane: vi.fn(() => ({ style: {} }) as unknown as HTMLElement),
    }),
  };
});

import SpotMap from "@/components/SpotMap";

beforeEach(() => {
  vi.clearAllMocks();
  sizeRef.current = { x: 800, y: 600 };
  fakeMap.getSize.mockImplementation(() => sizeRef.current);
});

describe("SpotMap -- fitToCity guarded against a zero-size container", () => {
  it("fits immediately, without retrying, when the container is already usably sized", () => {
    render(<SpotMap authStatus="signed-out" mapSpots={[]} fitToCity />);

    expect(fakeMap.fitBounds).toHaveBeenCalledTimes(1);
    expect(fakeMap.fitBounds).toHaveBeenCalledWith(CITY_OUTLINE_BOUNDS, expect.anything());
    expect(fakeMap.invalidateSize).not.toHaveBeenCalled();
  });

  it("never calls fitBounds against a zero-size container, and never throws", async () => {
    sizeRef.current = { x: 0, y: 0 };

    expect(() => render(<SpotMap authStatus="signed-out" mapSpots={[]} fitToCity />)).not.toThrow();

    // Give the effect's rAF retry a chance to run before asserting the
    // negative -- it will still see a zero size (this mock never resizes)
    // and must still not throw or call fitBounds on a 0x0 container.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fakeMap.fitBounds).not.toHaveBeenCalled();
  });

  it("recovers once the container picks up a real size (nudged via invalidateSize)", async () => {
    sizeRef.current = { x: 0, y: 0 };
    render(<SpotMap authStatus="signed-out" mapSpots={[]} fitToCity />);

    expect(fakeMap.fitBounds).not.toHaveBeenCalled();

    // Simulate the container's layout resolving between the mount effect
    // running and its one-frame-later retry.
    sizeRef.current = { x: 800, y: 600 };

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fakeMap.invalidateSize).toHaveBeenCalled();
    expect(fakeMap.fitBounds).toHaveBeenCalledTimes(1);
    expect(fakeMap.fitBounds).toHaveBeenCalledWith(CITY_OUTLINE_BOUNDS, expect.anything());
  });
});

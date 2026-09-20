import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CITY_OUTLINE_BOUNDS } from "@/lib/city-outline";

/**
 * SpotMap's `fitBounds` prop (preview round): Mi mapa hands it the preview
 * pins' box so the signed-out / empty map frames downtown instead of the
 * whole (tall) city outline. Same forwarded-ref fake map pattern as
 * SpotMap.wiring.test.tsx, trimmed to what a fit needs.
 */
const { fakeMap } = vi.hoisted(() => ({
  fakeMap: {
    on: vi.fn(),
    off: vi.fn(),
    setMaxBounds: vi.fn(),
    fitBounds: vi.fn(),
    // A real (non-zero) size so the zero-size guard's happy path (call
    // fitBounds immediately, no rAF retry) is what this file exercises --
    // the zero-size retry path has its own dedicated test file.
    getSize: vi.fn(() => ({ x: 800, y: 600 })),
    invalidateSize: vi.fn(),
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

const DOWNTOWN: [[number, number], [number, number]] = [
  [6.87, 122.05],
  [6.96, 122.09],
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SpotMap -- fitBounds prop", () => {
  it("fits the map to the given bounds once the Leaflet map exists", () => {
    render(<SpotMap authStatus="signed-out" mapSpots={[]} fitBounds={DOWNTOWN} />);

    expect(fakeMap.fitBounds).toHaveBeenCalledTimes(1);
    expect(fakeMap.fitBounds).toHaveBeenCalledWith(DOWNTOWN, expect.objectContaining({ maxZoom: expect.any(Number) }));
  });

  it("caps the zoom so a tight downtown cluster does not land at street level", () => {
    render(<SpotMap authStatus="signed-out" mapSpots={[]} fitBounds={DOWNTOWN} />);

    const options = fakeMap.fitBounds.mock.calls[0][1] as { maxZoom: number };
    expect(options.maxZoom).toBeLessThanOrEqual(16);
    expect(options.maxZoom).toBeGreaterThanOrEqual(13);
  });

  it("wins over fitToCity when both are set on the same mount (last call is the explicit bounds)", () => {
    render(<SpotMap authStatus="signed-out" mapSpots={[]} fitToCity fitBounds={DOWNTOWN} />);

    const calls = fakeMap.fitBounds.mock.calls;
    expect(calls.some(([bounds]) => bounds === CITY_OUTLINE_BOUNDS)).toBe(true);
    expect(calls[calls.length - 1][0]).toEqual(DOWNTOWN);
  });

  it("re-fits when the bounds value changes, but not on a re-render with an equal (new-identity) value", () => {
    const { rerender } = render(<SpotMap authStatus="signed-out" mapSpots={[]} fitBounds={DOWNTOWN} />);
    expect(fakeMap.fitBounds).toHaveBeenCalledTimes(1);

    rerender(<SpotMap authStatus="signed-out" mapSpots={[]} fitBounds={[[6.87, 122.05], [6.96, 122.09]]} />);
    expect(fakeMap.fitBounds).toHaveBeenCalledTimes(1);

    const wider: [[number, number], [number, number]] = [
      [6.8, 122.0],
      [7.0, 122.2],
    ];
    rerender(<SpotMap authStatus="signed-out" mapSpots={[]} fitBounds={wider} />);
    expect(fakeMap.fitBounds).toHaveBeenCalledTimes(2);
    expect(fakeMap.fitBounds).toHaveBeenLastCalledWith(wider, expect.anything());
  });

  it("does nothing without the prop, and does not fight a ?spot= deep link", () => {
    const { unmount } = render(<SpotMap authStatus="signed-out" mapSpots={[]} />);
    expect(fakeMap.fitBounds).not.toHaveBeenCalled();
    unmount();

    render(<SpotMap authStatus="signed-out" mapSpots={[]} fitBounds={DOWNTOWN} openSpotId="spot-1" />);
    expect(fakeMap.fitBounds).not.toHaveBeenCalled();
  });

  it("appears later (Mi mapa learns the account is empty after myMap resolves) and still fits", () => {
    const { rerender } = render(<SpotMap authStatus="signed-in" mapSpots={[]} fitToCity />);
    expect(fakeMap.fitBounds).toHaveBeenCalledTimes(1);
    expect(fakeMap.fitBounds).toHaveBeenLastCalledWith(CITY_OUTLINE_BOUNDS, expect.anything());

    rerender(<SpotMap authStatus="signed-in" mapSpots={[]} fitToCity fitBounds={DOWNTOWN} />);
    expect(fakeMap.fitBounds).toHaveBeenCalledTimes(2);
    expect(fakeMap.fitBounds).toHaveBeenLastCalledWith(DOWNTOWN, expect.anything());
  });
});

import { useEffect, useState, type ComponentType } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LatLng } from "@/lib/geo";

// MapInset.tsx wraps its own inner component in `next/dynamic` (unlike
// SpotMap, which is dynamic-imported by its *consumers* instead). We
// replace next/dynamic's default export with a stand-in that resolves the
// loader promise and renders the real inner component once it settles, so
// tests don't have to deal with an actual code-split chunk.
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<{ default: ComponentType<Record<string, unknown>> }>) => {
    function DynamicWrapper(props: Record<string, unknown>) {
      const [Comp, setComp] = useState<ComponentType<Record<string, unknown>> | null>(null);

      useEffect(() => {
        let cancelled = false;
        loader().then((mod) => {
          if (!cancelled) setComp(() => mod.default);
        });
        return () => {
          cancelled = true;
        };
      }, []);

      return Comp ? <Comp {...props} /> : null;
    }

    return DynamicWrapper;
  },
}));

// flyTo/setView/invalidateSize are asserted on directly, so they have to be
// spies that survive vi.mock's hoisting (a plain outer `let` wouldn't be
// initialized yet when the mock factory below runs). `sizeRef` lets a test
// flip what `getSize()` reports (a real size vs. the zero-size container
// that's the whole point of this regression suite) without needing a fresh
// mock per test.
const { flyToSpy, setViewSpy, invalidateSizeSpy, distanceSpy, sizeRef } = vi.hoisted(() => ({
  flyToSpy: vi.fn(),
  setViewSpy: vi.fn(),
  invalidateSizeSpy: vi.fn(),
  // Deterministic haversine test double -- production code goes through
  // the real Leaflet map's own `distance()`. Only needs to be directionally
  // correct (further apart -> bigger number) for this file's assertions.
  distanceSpy: vi.fn((a: [number, number], b: [number, number]) => {
    const R = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const [lat1, lng1] = a;
    const [lat2, lng2] = b;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const h =
      Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }),
  sizeRef: { current: { x: 800, y: 600 } },
}));

vi.mock("react-leaflet", async () => {
  const React = await import("react");
  return {
    MapContainer: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="map-container">{children}</div>
    ),
    TileLayer: () => <div data-testid="tile-layer" />,
    Marker: ({ position }: { position: unknown }) => (
      <div data-testid="marker" data-position={JSON.stringify(position)} />
    ),
    // Stand-in for the fading trail line (paseo-motion task 2.2) -- this
    // file doesn't assert on it directly, but a real Polyline import
    // rendering as `undefined` would crash every test that triggers a pan.
    Polyline: ({ positions }: { positions: unknown }) => (
      <div data-testid="trail" data-positions={JSON.stringify(positions)} />
    ),
    useMap: () => ({
      flyTo: flyToSpy,
      setView: setViewSpy,
      invalidateSize: invalidateSizeSpy,
      distance: distanceSpy,
      getZoom: () => 16,
      getSize: () => sizeRef.current,
    }),
  };
});

vi.mock("@/components/CityMask", () => ({
  default: () => <div data-testid="city-mask" />,
}));

import MapInset from "@/components/MapInset";

const CENTER_A: LatLng = { lat: 6.9042, lng: 122.0812 };
const CENTER_B: LatLng = { lat: 6.91, lng: 122.09 };

beforeEach(() => {
  flyToSpy.mockClear();
  setViewSpy.mockClear();
  invalidateSizeSpy.mockClear();
  distanceSpy.mockClear();
  sizeRef.current = { x: 800, y: 600 };
});

describe("MapInset", () => {
  it("renders a CityMask inside the map container", async () => {
    render(<MapInset center={CENTER_A} status="unconfirmed" onExpand={vi.fn()} />);

    const mapContainer = await screen.findByTestId("map-container");
    const cityMask = await screen.findByTestId("city-mask");

    expect(mapContainer).toContainElement(cityMask);
  });

  // Regression coverage for "Invalid LatLng object: (NaN, NaN)" taking down
  // the whole page: `MapContainer`'s own `center` prop already positions
  // the map correctly on first render, so FlyToCenter must not re-pan on
  // mount at all -- that redundant pan was also the one most likely to run
  // before layout had settled (see the zero-size test below).
  it("does not pan on mount when the container is already usably sized", async () => {
    render(<MapInset center={CENTER_A} status="unconfirmed" onExpand={vi.fn()} />);

    await screen.findByTestId("map-container");
    // Give any stray mount-time pan a chance to fire before asserting the
    // negative.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(flyToSpy).not.toHaveBeenCalled();
    expect(setViewSpy).not.toHaveBeenCalled();
  });

  it("pans exactly once, via flyTo, when the center changes and the container is usably sized", async () => {
    const { rerender } = render(<MapInset center={CENTER_A} status="unconfirmed" onExpand={vi.fn()} />);
    await screen.findByTestId("map-container");

    rerender(<MapInset center={CENTER_B} status="unconfirmed" onExpand={vi.fn()} />);

    await waitFor(() => expect(flyToSpy).toHaveBeenCalledTimes(1));
    expect(flyToSpy).toHaveBeenCalledWith([CENTER_B.lat, CENTER_B.lng], 16, expect.anything());
    expect(setViewSpy).not.toHaveBeenCalled();
  });

  // The exact regression this suite exists for: a zero-size container (the
  // `fill` variant, `app/page.tsx`'s desktop right column, before its flex
  // layout resolves a real height) must never reach `flyTo` -- its
  // animation math divides by the container's pixel size and produces NaN,
  // which Leaflet's `LatLng` constructor then throws on.
  it("never calls flyTo and never throws when the container has a zero size", async () => {
    sizeRef.current = { x: 0, y: 0 };
    const { rerender } = render(<MapInset center={CENTER_A} status="unconfirmed" onExpand={vi.fn()} />);
    await screen.findByTestId("map-container");

    rerender(<MapInset center={CENTER_B} status="unconfirmed" onExpand={vi.fn()} />);

    // Give the effect a chance to run before asserting the negative.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(flyToSpy).not.toHaveBeenCalled();
  });

  // Regression coverage for "Invalid LatLng object: (NaN, NaN)" (a full-page
  // runtime crash): a caller can hand MapInset a center before any real spot
  // is active (page.tsx's right-column map before the first card loads) or
  // a row whose coordinates didn't survive the trip from the database. Either
  // way, MapInset must degrade to rendering nothing rather than handing
  // Leaflet a non-finite LatLng.
  it.each<{ name: string; center: LatLng | undefined }>([
    { name: "center is undefined", center: undefined },
    { name: "lat is NaN", center: { lat: NaN, lng: 122.0812 } },
    { name: "lng is NaN", center: { lat: 6.9042, lng: NaN } },
    { name: "lat is Infinity", center: { lat: Infinity, lng: 122.0812 } },
    { name: "lng is -Infinity", center: { lat: 6.9042, lng: -Infinity } },
  ])("renders nothing and never calls flyTo when $name", async ({ center }) => {
    flyToSpy.mockClear();
    render(<MapInset center={center as LatLng} status="unconfirmed" onExpand={vi.fn()} />);

    // Give the dynamic loader + any effects a chance to run before asserting
    // the negative -- there's nothing to `findBy`, so a short wait is the
    // only way to let a would-be crash actually surface here.
    await waitFor(() => expect(flyToSpy).not.toHaveBeenCalled());

    expect(screen.queryByTestId("map-container")).not.toBeInTheDocument();
  });
});

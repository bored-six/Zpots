import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LatLng } from "@/lib/geo";

/**
 * Paseo motion pass, task 2.2 -- the inset's `flyTo` should scale its
 * duration with hop distance and leave a fading trail behind it, without
 * regressing any of the mount/zero-size guards `MapInset.test.tsx` already
 * covers. This file exercises `MapInsetInner` directly (no `next/dynamic`
 * wrapper needed -- same approach as `MapInsetInner.pergamino.test.tsx`).
 */

const { flyToSpy, setViewSpy, invalidateSizeSpy, distanceSpy, sizeRef } = vi.hoisted(() => ({
  flyToSpy: vi.fn(),
  setViewSpy: vi.fn(),
  invalidateSizeSpy: vi.fn(),
  // Deterministic haversine test double -- production code goes through
  // the real Leaflet map's own `distance()`.
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
    Marker: () => <div data-testid="marker" />,
    Polyline: ({
      positions,
      pathOptions,
    }: {
      positions: unknown;
      pathOptions?: { opacity?: number };
    }) => (
      <div
        data-testid="trail"
        data-positions={JSON.stringify(positions)}
        data-opacity={pathOptions?.opacity}
      />
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

vi.mock("@/components/BasemapLayer", () => ({
  default: () => <div data-testid="basemap" />,
}));

import MapInsetInner from "@/components/MapInsetInner";

const NEAR_A: LatLng = { lat: 6.9042, lng: 122.0812 };
// ~40m from NEAR_A.
const NEAR_B: LatLng = { lat: 6.9045, lng: 122.0815 };
// Several km from NEAR_A.
const FAR: LatLng = { lat: 6.95, lng: 122.15 };

beforeEach(() => {
  flyToSpy.mockClear();
  setViewSpy.mockClear();
  invalidateSizeSpy.mockClear();
  distanceSpy.mockClear();
  sizeRef.current = { x: 800, y: 600 };
});

afterEach(() => {
  cleanup();
});

describe("MapInsetInner -- distance-scaled flight duration", () => {
  it("does not call flyTo on mount", async () => {
    render(<MapInsetInner center={NEAR_A} status="unconfirmed" onExpand={vi.fn()} />);
    await screen.findByTestId("map-container");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(flyToSpy).not.toHaveBeenCalled();
  });

  it("gives a near hop a short duration and a far hop a longer one, both clamped", async () => {
    const { rerender } = render(
      <MapInsetInner center={NEAR_A} status="unconfirmed" onExpand={vi.fn()} />,
    );
    await screen.findByTestId("map-container");

    rerender(<MapInsetInner center={NEAR_B} status="unconfirmed" onExpand={vi.fn()} />);
    await waitFor(() => expect(flyToSpy).toHaveBeenCalledTimes(1));
    const nearDuration = (flyToSpy.mock.calls[0][2] as { duration: number }).duration;

    expect(nearDuration).toBeGreaterThanOrEqual(0.35);
    expect(nearDuration).toBeLessThanOrEqual(1.1);

    flyToSpy.mockClear();
    rerender(<MapInsetInner center={FAR} status="unconfirmed" onExpand={vi.fn()} />);
    await waitFor(() => expect(flyToSpy).toHaveBeenCalledTimes(1));
    const farDuration = (flyToSpy.mock.calls[0][2] as { duration: number }).duration;

    expect(farDuration).toBeGreaterThan(nearDuration);
    expect(farDuration).toBeGreaterThanOrEqual(0.35);
    expect(farDuration).toBeLessThanOrEqual(1.1);
  });

  it("still calls flyTo exactly once per center change with a non-null options object", async () => {
    const { rerender } = render(
      <MapInsetInner center={NEAR_A} status="unconfirmed" onExpand={vi.fn()} />,
    );
    await screen.findByTestId("map-container");

    rerender(<MapInsetInner center={FAR} status="unconfirmed" onExpand={vi.fn()} />);

    await waitFor(() => expect(flyToSpy).toHaveBeenCalledTimes(1));
    expect(flyToSpy).toHaveBeenCalledWith([FAR.lat, FAR.lng], 16, expect.anything());
  });

  it("never calls flyTo and never draws a trail when the container has a zero size", async () => {
    sizeRef.current = { x: 0, y: 0 };
    const { rerender } = render(
      <MapInsetInner center={NEAR_A} status="unconfirmed" onExpand={vi.fn()} />,
    );
    await screen.findByTestId("map-container");

    rerender(<MapInsetInner center={FAR} status="unconfirmed" onExpand={vi.fn()} />);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(flyToSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId("trail")).not.toBeInTheDocument();
  });
});

describe("MapInsetInner -- fading trail", () => {
  it("draws no trail on first render", async () => {
    render(<MapInsetInner center={NEAR_A} status="unconfirmed" onExpand={vi.fn()} />);
    await screen.findByTestId("map-container");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(screen.queryByTestId("trail")).not.toBeInTheDocument();
  });

  it("draws a trail from the previous center to the new one on a real move, then removes it", async () => {
    const { rerender } = render(
      <MapInsetInner center={NEAR_A} status="unconfirmed" onExpand={vi.fn()} />,
    );
    await screen.findByTestId("map-container");

    rerender(<MapInsetInner center={NEAR_B} status="unconfirmed" onExpand={vi.fn()} />);

    const trail = await screen.findByTestId("trail");
    const positions = JSON.parse(trail.getAttribute("data-positions") ?? "[]");
    expect(positions).toEqual([
      [NEAR_A.lat, NEAR_A.lng],
      [NEAR_B.lat, NEAR_B.lng],
    ]);

    await waitFor(() => expect(screen.queryByTestId("trail")).not.toBeInTheDocument(), {
      timeout: 3000,
    });
  }, 8000);

  it("never stacks trails on rapid successive swipes", async () => {
    const { rerender } = render(
      <MapInsetInner center={NEAR_A} status="unconfirmed" onExpand={vi.fn()} />,
    );
    await screen.findByTestId("map-container");

    rerender(<MapInsetInner center={NEAR_B} status="unconfirmed" onExpand={vi.fn()} />);
    await screen.findByTestId("trail");

    rerender(<MapInsetInner center={FAR} status="unconfirmed" onExpand={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryAllByTestId("trail").length).toBeLessThanOrEqual(1);
    });
  });

  it("cleans up the trail timer on unmount without leaking", async () => {
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");
    const { rerender, unmount } = render(
      <MapInsetInner center={NEAR_A} status="unconfirmed" onExpand={vi.fn()} />,
    );
    await screen.findByTestId("map-container");

    rerender(<MapInsetInner center={NEAR_B} status="unconfirmed" onExpand={vi.fn()} />);
    await screen.findByTestId("trail");

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});

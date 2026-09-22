import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LatLng } from "@/lib/geo";

/**
 * paseo-motion.md, phone-inset travel fix -- each deck card mounts its own
 * MapInsetInner at a fixed `center` that never changes over that card's
 * lifetime, so the existing `center`-change-driven flyTo (already covered by
 * MapInsetInner.motion.test.tsx, exercising the desktop single-instance
 * path) never had anything to react to on phone. This file exercises the
 * new contract instead: an `active` flag, plus a `previousCenter` (the
 * walk's current stop) read fresh at the exact moment `active` flips true.
 *
 * - `active` false: never calls flyTo or setView, no matter what changes.
 * - `active` becoming true (while `center` itself never changes) recenters
 *   instantly to `previousCenter` and then flies from there to `center`.
 * - The very first render/effect run never pans, regardless of `active`.
 * - No `previousCenter` available at activation (nothing to travel from):
 *   no pan at all, not even a same-point no-op flyTo.
 * - Omitting the new props entirely (every existing caller) behaves exactly
 *   like before -- covered already by MapInset.test.tsx and
 *   MapInsetInner.motion.test.tsx, both left untouched by this task.
 */

const { flyToSpy, setViewSpy, invalidateSizeSpy, distanceSpy, sizeRef } = vi.hoisted(() => ({
  flyToSpy: vi.fn(),
  setViewSpy: vi.fn(),
  invalidateSizeSpy: vi.fn(),
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
    Marker: ({ position }: { position: unknown }) => (
      <div data-testid="marker" data-position={JSON.stringify(position)} />
    ),
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

vi.mock("@/components/BasemapLayer", () => ({
  default: () => <div data-testid="basemap" />,
}));

import MapInsetInner from "@/components/MapInsetInner";

const ORIGIN: LatLng = { lat: 6.9042, lng: 122.0812 };
const TARGET: LatLng = { lat: 6.91, lng: 122.09 };

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

describe("MapInsetInner -- per-card travel (active + previousCenter)", () => {
  it("never pans on the very first render, even inactive with a previousCenter available", async () => {
    render(
      <MapInsetInner
        center={TARGET}
        previousCenter={ORIGIN}
        active={false}
        status="unconfirmed"
        onExpand={vi.fn()}
      />,
    );
    await screen.findByTestId("map-container");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(flyToSpy).not.toHaveBeenCalled();
    expect(setViewSpy).not.toHaveBeenCalled();
  });

  it("never pans on the very first render even when already active at mount", async () => {
    render(
      <MapInsetInner center={TARGET} previousCenter={ORIGIN} active status="unconfirmed" onExpand={vi.fn()} />,
    );
    await screen.findByTestId("map-container");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(flyToSpy).not.toHaveBeenCalled();
    expect(setViewSpy).not.toHaveBeenCalled();
  });

  it("a non-active card never pans, no matter what re-renders it", async () => {
    const { rerender } = render(
      <MapInsetInner
        center={TARGET}
        previousCenter={ORIGIN}
        active={false}
        status="unconfirmed"
        onExpand={vi.fn()}
      />,
    );
    await screen.findByTestId("map-container");

    // Re-render a few times while still inactive -- an unrelated prop
    // change (size) must not sneak a pan in.
    rerender(
      <MapInsetInner
        center={TARGET}
        previousCenter={ORIGIN}
        active={false}
        status="unconfirmed"
        onExpand={vi.fn()}
        size={140}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(flyToSpy).not.toHaveBeenCalled();
    expect(setViewSpy).not.toHaveBeenCalled();
  });

  it("becoming active recenters instantly to previousCenter, then flies from there to center", async () => {
    const { rerender } = render(
      <MapInsetInner
        center={TARGET}
        previousCenter={ORIGIN}
        active={false}
        status="unconfirmed"
        onExpand={vi.fn()}
      />,
    );
    await screen.findByTestId("map-container");

    rerender(
      <MapInsetInner center={TARGET} previousCenter={ORIGIN} active status="unconfirmed" onExpand={vi.fn()} />,
    );

    await waitFor(() => expect(flyToSpy).toHaveBeenCalledTimes(1));
    // The instant recenter must happen before the animated flight, in the
    // same effect run, so the browser never paints the intermediate frame.
    expect(setViewSpy).toHaveBeenCalledWith([ORIGIN.lat, ORIGIN.lng], 16, { animate: false });
    expect(flyToSpy).toHaveBeenCalledWith([TARGET.lat, TARGET.lng], 16, expect.anything());

    const trail = await screen.findByTestId("trail");
    expect(JSON.parse(trail.getAttribute("data-positions") ?? "[]")).toEqual([
      [ORIGIN.lat, ORIGIN.lng],
      [TARGET.lat, TARGET.lng],
    ]);
  });

  it("becoming active with no previousCenter available (nothing walked yet) does not pan at all", async () => {
    const { rerender } = render(
      <MapInsetInner center={TARGET} previousCenter={null} active={false} status="unconfirmed" onExpand={vi.fn()} />,
    );
    await screen.findByTestId("map-container");

    rerender(
      <MapInsetInner center={TARGET} previousCenter={null} active status="unconfirmed" onExpand={vi.fn()} />,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(flyToSpy).not.toHaveBeenCalled();
    expect(setViewSpy).not.toHaveBeenCalled();
  });

  it("a card already active at mount with the same previousCenter as its own coords does not pan", async () => {
    render(
      <MapInsetInner center={TARGET} previousCenter={TARGET} active status="unconfirmed" onExpand={vi.fn()} />,
    );
    await screen.findByTestId("map-container");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(flyToSpy).not.toHaveBeenCalled();
  });

  it("deactivating then reactivating with the same previousCenter does not replay a dishonest second travel", async () => {
    const { rerender } = render(
      <MapInsetInner
        center={TARGET}
        previousCenter={ORIGIN}
        active={false}
        status="unconfirmed"
        onExpand={vi.fn()}
      />,
    );
    await screen.findByTestId("map-container");

    rerender(
      <MapInsetInner center={TARGET} previousCenter={ORIGIN} active status="unconfirmed" onExpand={vi.fn()} />,
    );
    await waitFor(() => expect(flyToSpy).toHaveBeenCalledTimes(1));
    flyToSpy.mockClear();
    setViewSpy.mockClear();

    // Deactivate -- no camera work at all.
    rerender(
      <MapInsetInner
        center={TARGET}
        previousCenter={ORIGIN}
        active={false}
        status="unconfirmed"
        onExpand={vi.fn()}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(flyToSpy).not.toHaveBeenCalled();

    // Reactivate with the SAME previousCenter it already flew from and
    // landed at `center` -- nothing new to travel from, so no pan.
    rerender(
      <MapInsetInner center={TARGET} previousCenter={ORIGIN} active status="unconfirmed" onExpand={vi.fn()} />,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(flyToSpy).not.toHaveBeenCalled();
  });

  // This instance already performed its one activation-triggered travel
  // above; the camera genuinely sits at `center` now (a real completed
  // flight, not a mount-time assumption), so a *different* previousCenter
  // on a later reactivation still must not replay a fake pan -- the camera
  // never actually left `center` in between, so pretending otherwise would
  // be as dishonest as replaying the same value.
  it("is a true one-shot: a later reactivation never travels again, even with a different previousCenter", async () => {
    const { rerender } = render(
      <MapInsetInner
        center={TARGET}
        previousCenter={ORIGIN}
        active={false}
        status="unconfirmed"
        onExpand={vi.fn()}
      />,
    );
    await screen.findByTestId("map-container");

    rerender(
      <MapInsetInner center={TARGET} previousCenter={ORIGIN} active status="unconfirmed" onExpand={vi.fn()} />,
    );
    await waitFor(() => expect(flyToSpy).toHaveBeenCalledTimes(1));
    flyToSpy.mockClear();
    setViewSpy.mockClear();

    rerender(
      <MapInsetInner
        center={TARGET}
        previousCenter={ORIGIN}
        active={false}
        status="unconfirmed"
        onExpand={vi.fn()}
      />,
    );

    const FAR: LatLng = { lat: 6.95, lng: 122.15 };
    rerender(
      <MapInsetInner center={TARGET} previousCenter={FAR} active status="unconfirmed" onExpand={vi.fn()} />,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(flyToSpy).not.toHaveBeenCalled();
    expect(setViewSpy).not.toHaveBeenCalled();
  });

  it("never calls flyTo, and never recenters to the origin, when the container has a zero size", async () => {
    // Pre-existing zero-size fallback (unrelated to this task): the effect
    // still calls `safeSetView(map, center)` -- see MapInset.test.tsx's own
    // zero-size case, which likewise only asserts flyTo. This test's own
    // job is narrower: the *new* instant-recenter-to-origin call must never
    // fire here, since it lives inside the same `hasUsableMapSize` guard as
    // flyTo.
    sizeRef.current = { x: 0, y: 0 };
    const { rerender } = render(
      <MapInsetInner
        center={TARGET}
        previousCenter={ORIGIN}
        active={false}
        status="unconfirmed"
        onExpand={vi.fn()}
      />,
    );
    await screen.findByTestId("map-container");

    rerender(
      <MapInsetInner center={TARGET} previousCenter={ORIGIN} active status="unconfirmed" onExpand={vi.fn()} />,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(flyToSpy).not.toHaveBeenCalled();
    expect(setViewSpy).not.toHaveBeenCalledWith([ORIGIN.lat, ORIGIN.lng], expect.anything(), expect.anything());
  });

  it("omitting active and previousCenter behaves exactly like the desktop single-instance path (regression)", async () => {
    const { rerender } = render(
      <MapInsetInner center={ORIGIN} status="unconfirmed" onExpand={vi.fn()} />,
    );
    await screen.findByTestId("map-container");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(flyToSpy).not.toHaveBeenCalled();

    rerender(<MapInsetInner center={TARGET} status="unconfirmed" onExpand={vi.fn()} />);
    await waitFor(() => expect(flyToSpy).toHaveBeenCalledTimes(1));
    expect(flyToSpy).toHaveBeenCalledWith([TARGET.lat, TARGET.lng], 16, expect.anything());
    // The instant recenter is only for the phone activation case -- the
    // desktop path already sits at the right spot (it's the same instance
    // that was just showing the previous center), so it must never fire.
    expect(setViewSpy).not.toHaveBeenCalled();
  });
});

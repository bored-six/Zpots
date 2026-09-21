import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LatLng } from "@/lib/geo";

/**
 * paseo-motion.md fix-round-2, finding 2 -- `createPinIcon`'s `justConfirmed`
 * option must actually reach the deck card's map inset, not just exist in
 * `lib/pin-icon.ts` with its own isolated test. Mocks `@/lib/pin-icon`
 * directly (rather than asserting on real Leaflet divIcon HTML) so this
 * stays a pure wiring test: did MapInsetInner forward the prop, not "does
 * pin-icon.ts do the right thing with it" (already covered by
 * pin-icon.just-confirmed.test.ts).
 */
const { createPinIconSpy, markerIconCalls } = vi.hoisted(() => ({
  createPinIconSpy: vi.fn(() => ({ options: { html: "<div/>" } })),
  // Every `icon` prop react-leaflet's real `Marker` ever received, in
  // render order -- lets the stability tests below check reference
  // equality across renders, something the old mock (a `Marker` that
  // dropped its props entirely) could never catch.
  markerIconCalls: [] as unknown[],
}));

vi.mock("@/lib/pin-icon", () => ({
  createPinIcon: createPinIconSpy,
}));

vi.mock("react-leaflet", async () => {
  const React = await import("react");
  return {
    MapContainer: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="map-container">{children}</div>
    ),
    Marker: ({ icon }: { icon?: unknown }) => {
      markerIconCalls.push(icon);
      return <div data-testid="marker" />;
    },
    Polyline: () => null,
    useMap: () => ({
      flyTo: vi.fn(),
      setView: vi.fn(),
      invalidateSize: vi.fn(),
      distance: vi.fn(() => 0),
      getZoom: () => 16,
      getSize: () => ({ x: 800, y: 600 }),
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

const CENTER: LatLng = { lat: 6.9098, lng: 122.079 };

describe("MapInsetInner -- just-confirmed pin wiring", () => {
  it("passes justConfirmed: false by default", async () => {
    render(<MapInsetInner center={CENTER} status="confirmed" onExpand={vi.fn()} />);
    await screen.findByTestId("map-container");

    expect(createPinIconSpy).toHaveBeenCalledWith("confirmed", { justConfirmed: false });
  });

  it("forwards justConfirmed: true through to createPinIcon", async () => {
    render(<MapInsetInner center={CENTER} status="confirmed" justConfirmed onExpand={vi.fn()} />);
    await screen.findByTestId("map-container");

    expect(createPinIconSpy).toHaveBeenCalledWith("confirmed", { justConfirmed: true });
  });

  /**
   * paseo-motion.md fix-round-2, finding 1 -- MapInsetInner used to call
   * `createPinIcon` inline in JSX, so it ran again on every render whether
   * or not `status`/`justConfirmed` changed. react-leaflet's `Marker`
   * only calls `setIcon` when `props.icon !== prevProps.icon` (a reference
   * check, verified against node_modules/react-leaflet/lib/Marker.js), and
   * Leaflet's `DivIcon.createIcon` unconditionally does
   * `div.innerHTML = options.html` (verified against
   * node_modules/leaflet/src/layer/marker/DivIcon.js) -- so a fresh icon
   * object on an unrelated re-render tears down and rebuilds the marker's
   * DOM, restarting the one-shot `.zpots-pin-icon--just-confirmed` halo
   * animation. The old mock below (`Marker: () => <div data-testid="marker" />`)
   * dropped the `icon` prop entirely and could never have caught this.
   */
  it("keeps the pin icon reference stable across a re-render that doesn't change status or justConfirmed", async () => {
    const { rerender } = render(
      <MapInsetInner center={CENTER} status="confirmed" justConfirmed onExpand={vi.fn()} />,
    );
    await screen.findByTestId("map-container");

    const callsAfterFirstRender = createPinIconSpy.mock.calls.length;
    const iconAfterFirstRender = markerIconCalls.at(-1);

    // Unrelated re-render: a new `onExpand` identity and a `size` change --
    // neither is one of createPinIcon's inputs (status, justConfirmed).
    rerender(
      <MapInsetInner
        center={CENTER}
        status="confirmed"
        justConfirmed
        onExpand={vi.fn()}
        size={140}
      />,
    );
    await screen.findByTestId("map-container");

    expect(createPinIconSpy.mock.calls.length).toBe(callsAfterFirstRender);
    expect(markerIconCalls.at(-1)).toBe(iconAfterFirstRender);
  });
});

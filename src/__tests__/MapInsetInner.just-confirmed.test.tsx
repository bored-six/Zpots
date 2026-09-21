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
const { createPinIconSpy } = vi.hoisted(() => ({
  createPinIconSpy: vi.fn(() => ({ options: { html: "<div/>" } })),
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
    Marker: () => <div data-testid="marker" />,
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
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Same lightweight react-leaflet stand-in pattern as SpotMap.test.tsx (that
// file is frozen, so this is a separate mock scoped to this file), extended
// to surface the bounds-restriction props this test cares about.
vi.mock("react-leaflet", () => {
  return {
    MapContainer: ({
      center,
      zoom,
      minZoom,
      maxZoom,
      maxBounds,
      maxBoundsViscosity,
      children,
    }: {
      center: unknown;
      zoom: unknown;
      minZoom: unknown;
      maxZoom: unknown;
      maxBounds: unknown;
      maxBoundsViscosity: unknown;
      children?: React.ReactNode;
    }) => (
      <div
        data-testid="map-container"
        data-center={JSON.stringify(center)}
        data-zoom={String(zoom)}
        data-min-zoom={String(minZoom)}
        data-max-zoom={String(maxZoom)}
        data-max-bounds={JSON.stringify(maxBounds)}
        data-max-bounds-viscosity={String(maxBoundsViscosity)}
      >
        {children}
      </div>
    ),
    TileLayer: () => <div data-testid="tile-layer" />,
    Marker: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="marker">{children}</div>
    ),
    Popup: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="popup">{children}</div>
    ),
  };
});

import SpotMap from "@/components/SpotMap";
import { MAX_BOUNDS, MIN_ZOOM } from "@/lib/map-config";

describe("SpotMap Zamboanga City restriction", () => {
  it("passes MAX_BOUNDS as maxBounds to MapContainer", () => {
    render(<SpotMap spots={[]} />);
    const map = screen.getByTestId("map-container");
    expect(JSON.parse(map.getAttribute("data-max-bounds") ?? "null")).toEqual(MAX_BOUNDS);
  });

  it("sets maxBoundsViscosity so panning bounces back at the edge instead of scrolling freely", () => {
    render(<SpotMap spots={[]} />);
    const map = screen.getByTestId("map-container");
    // 1.0 is a hard stop -- the standard choice unless there's a reason to
    // allow rubber-banding past the bounds.
    expect(map.getAttribute("data-max-bounds-viscosity")).toBe("1");
  });

  it("passes MIN_ZOOM through to MapContainer's minZoom prop", () => {
    render(<SpotMap spots={[]} />);
    const map = screen.getByTestId("map-container");
    expect(map.getAttribute("data-min-zoom")).toBe(String(MIN_ZOOM));
  });
});

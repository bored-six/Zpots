import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LatLng } from "@/lib/geo";

/**
 * Pergamino PRD, T3.2 -- MapInsetInner. Per D3/D4, the 112px deck inset gets
 * the vector ground via `BasemapLayer` and its live map instance, but *no*
 * `PlaceLabelsLayer` and *no* raster-fallback chip (E17: "112 px deck inset
 * would be unreadable with labels"; D6: "the 112 px deck inset ... fall
 * back silently -- a notice chip does not fit in 112 px"). This file never
 * mocks `useMap()` -- `BasemapLayer` takes an explicit `map` prop (D4) -- so
 * `react-leaflet`'s `MapContainer` stand-in below only needs to forward its
 * `ref` to a hand-written fake map, the same shape used by
 * `PostFlow.test.tsx`.
 */

const { fakeMap } = vi.hoisted(() => ({
  fakeMap: { on: vi.fn(), off: vi.fn() },
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
    Marker: () => <div data-testid="marker" />,
    // FlyToCenter (unrelated to this task, unchanged) reads these off
    // useMap() -- stubbed only so it doesn't throw, same shape as
    // MapInset.test.tsx's fuller useMap() mock.
    useMap: () => ({
      flyTo: vi.fn(),
      setView: vi.fn(),
      invalidateSize: vi.fn(),
      getZoom: () => 16,
      getSize: () => ({ x: 112, y: 112 }),
    }),
  };
});

vi.mock("@/components/CityMask", () => ({
  default: () => <div data-testid="city-mask" />,
}));

vi.mock("@/components/BasemapLayer", () => ({
  default: (props: { map: unknown; onModeChange?: unknown }) => (
    <div
      data-testid="basemap"
      data-has-map={props.map ? "yes" : "no"}
      data-has-mode-change={props.onModeChange ? "yes" : "no"}
    />
  ),
}));

import MapInsetInner from "@/components/MapInsetInner";

const CENTER: LatLng = { lat: 6.9042, lng: 122.0812 };

beforeEach(() => {
  fakeMap.on.mockClear();
  fakeMap.off.mockClear();
});

describe("MapInsetInner -- Pergamino wiring (T3.2)", () => {
  it("renders exactly one BasemapLayer and no raster TileLayer", async () => {
    render(<MapInsetInner center={CENTER} status="unconfirmed" onExpand={vi.fn()} />);

    expect(await screen.findAllByTestId("basemap")).toHaveLength(1);
    expect(screen.queryByTestId("tile-layer")).not.toBeInTheDocument();
  });

  it("passes the live map instance to BasemapLayer", async () => {
    render(<MapInsetInner center={CENTER} status="unconfirmed" onExpand={vi.fn()} />);

    const basemap = await screen.findByTestId("basemap");
    expect(basemap).toHaveAttribute("data-has-map", "yes");
  });

  it("renders no raster-fallback notice chip, even though the component has no way to enter raster mode itself", async () => {
    render(<MapInsetInner center={CENTER} status="unconfirmed" onExpand={vi.fn()} />);

    expect(screen.queryByText(/simple/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/simplified/i)).not.toBeInTheDocument();
  });

  it("does not import or render PlaceLabelsLayer -- the inset is ground + pin only", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/MapInsetInner.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/from ["']@\/components\/PlaceLabelsLayer["']/);
    expect(source).not.toMatch(/<PlaceLabelsLayer\b/);
  });

  it("still renders CityMask and the spot marker alongside the new basemap", async () => {
    render(<MapInsetInner center={CENTER} status="unconfirmed" onExpand={vi.fn()} />);

    expect(await screen.findByTestId("city-mask")).toBeInTheDocument();
    expect(await screen.findByTestId("marker")).toBeInTheDocument();
  });
});

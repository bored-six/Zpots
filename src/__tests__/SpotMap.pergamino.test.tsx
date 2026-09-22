import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Map as LeafletMap } from "leaflet";

import { COPY } from "@/lib/copy";

/**
 * Pergamino PRD, T3.1 (tests 59-62). SpotMap wires the live Leaflet map
 * instance into BasemapLayer/PlaceLabelsLayer as an explicit prop (D4 --
 * neither of those components ever calls useMap()), so this file mocks
 * those two components directly (recording the props each call received)
 * rather than trying to exercise real Leaflet in jsdom. react-leaflet's own
 * MapContainer stand-in forwards a hand-written fake map through `ref`, the
 * same pattern SpotMap.wiring.test.tsx already uses, so `leafletMap` in
 * SpotMap actually becomes non-null after mount.
 */

const { fakeMap } = vi.hoisted(() => ({
  // setMaxBounds and on/off are called imperatively once the map instance
  // is available (SpotMap.tsx's belt-and-suspenders bounds effect and its
  // map-click listener) -- no-ops are enough, this file never asserts on
  // either.
  fakeMap: {
    setMaxBounds: () => {},
    on: () => {},
    off: () => {},
    getZoom: () => 14,
  } as unknown as LeafletMap,
}));

const { basemapLayerMock, placeLabelsLayerMock, modeChangeRef } = vi.hoisted(() => ({
  basemapLayerMock: vi.fn(),
  placeLabelsLayerMock: vi.fn(),
  modeChangeRef: { current: undefined as ((mode: string) => void) | undefined },
}));

vi.mock("@/components/BasemapLayer", () => ({
  default: (props: { map: unknown; onModeChange?: (mode: string) => void }) => {
    basemapLayerMock(props);
    modeChangeRef.current = props.onModeChange;
    return <div data-testid="basemap-layer-stub" />;
  },
}));

vi.mock("@/components/PlaceLabelsLayer", () => ({
  default: (props: { map: unknown }) => {
    placeLabelsLayerMock(props);
    return <div data-testid="place-labels-layer-stub" />;
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
    Marker: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="marker">{children}</div>
    ),
    Popup: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="popup">{children}</div>
    ),
    Polygon: () => <div data-testid="polygon" />,
    Polyline: () => <div data-testid="polyline" />,
    useMap: () => ({
      createPane: vi.fn(() => ({ style: {} }) as unknown as HTMLElement),
      getPane: vi.fn(() => ({ style: {} }) as unknown as HTMLElement),
      fitBounds: vi.fn(),
      flyTo: vi.fn(),
      setView: vi.fn(),
    }),
  };
});

import SpotMap from "@/components/SpotMap";

beforeEach(() => {
  basemapLayerMock.mockClear();
  placeLabelsLayerMock.mockClear();
  modeChangeRef.current = undefined;
});

describe("SpotMap x Pergamino wiring", () => {
  it("passes the same live map instance to BasemapLayer and PlaceLabelsLayer", () => {
    render(<SpotMap authStatus="signed-out" />);

    expect(basemapLayerMock).toHaveBeenCalled();
    expect(placeLabelsLayerMock).toHaveBeenCalled();

    const lastBasemapProps = basemapLayerMock.mock.calls.at(-1)?.[0];
    const lastPlaceLabelsProps = placeLabelsLayerMock.mock.calls.at(-1)?.[0];

    expect(lastBasemapProps.map).toBe(fakeMap);
    expect(lastPlaceLabelsProps.map).toBe(fakeMap);
  });

  it('shows the bilingual "Simplified map" chip when basemapMode is "raster"', () => {
    render(<SpotMap authStatus="signed-out" />);

    act(() => {
      modeChangeRef.current?.("raster");
    });

    const english = screen.getByText(COPY.simpleMap.en);
    expect(english).toBeInTheDocument();
    expect(english).not.toHaveAttribute("aria-hidden");

    const chavacano = screen.getByText(COPY.simpleMap.cv);
    expect(chavacano).toBeInTheDocument();
    expect(chavacano).toHaveAttribute("aria-hidden", "true");
  });

  it("gives the raster chip a title and an accessible description explaining why it's showing", () => {
    render(<SpotMap authStatus="signed-out" />);

    act(() => {
      modeChangeRef.current?.("raster");
    });

    const chip = screen.getByText(COPY.simpleMap.en).closest("div");
    expect(chip).not.toBeNull();
    expect(chip).toHaveAttribute("title", COPY.simpleMapWhy.en);

    const describedById = chip?.getAttribute("aria-describedby");
    expect(describedById).toBeTruthy();
    const description = document.getElementById(describedById as string);
    expect(description).not.toBeNull();
    expect(description).toHaveTextContent(COPY.simpleMapWhy.en);
  });

  it('renders no chip anywhere in the tree when basemapMode is "pergamino"', () => {
    render(<SpotMap authStatus="signed-out" />);

    act(() => {
      modeChangeRef.current?.("pergamino");
    });

    expect(screen.queryByText(COPY.simpleMap.en)).not.toBeInTheDocument();
    expect(screen.queryByText(COPY.simpleMap.cv)).not.toBeInTheDocument();
  });

  it("also renders no chip before any mode change fires (initial state)", () => {
    render(<SpotMap authStatus="signed-out" />);
    expect(screen.queryByText(COPY.simpleMap.en)).not.toBeInTheDocument();
  });

  it("renders the raster chip outside MapContainer's children, never covering the popup", () => {
    render(<SpotMap authStatus="signed-out" />);

    act(() => {
      modeChangeRef.current?.("raster");
    });

    const mapContainer = screen.getByTestId("map-container");
    const chipText = screen.getByText(COPY.simpleMap.en);

    expect(mapContainer.contains(chipText)).toBe(false);
  });
});

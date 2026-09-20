import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Spot } from "@/lib/spots";

/**
 * Frozen-style mock, same shape as SpotMap.test.tsx's -- static rendering
 * only, no map-tap wiring needed for these popup-content assertions.
 */
vi.mock("react-leaflet", async () => {
  const React = await import("react");
  return {
    MapContainer: React.forwardRef(function MockMapContainer(
      { children }: { children?: React.ReactNode },
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => null);
      return <div data-testid="map-container">{children}</div>;
    }),
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

function makeSpot(overrides: Partial<Spot> = {}): Spot {
  return {
    id: "spot-1",
    name: "Rio Hondo Boardwalk",
    note: "Great sunset view.",
    lat: 6.9,
    lng: 122.05,
    status: "unconfirmed",
    confirmations: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseProps(spots: readonly Spot[]) {
  return {
    spots,
    authStatus: "signed-out" as const,
    onCreateSpot: vi.fn().mockResolvedValue(undefined),
    onConfirmSpot: vi.fn().mockResolvedValue(undefined),
    onReportSpot: vi.fn().mockResolvedValue(undefined),
  };
}

describe("SpotMap popup -- photo and confirmation count", () => {
  it("renders an img with alt 'Photo of <name>' when the spot has a photoUrl", () => {
    const spot = makeSpot({ photoUrl: "https://example.com/photo.jpg" });
    render(<SpotMap {...baseProps([spot])} />);
    const popup = screen.getByTestId("popup");

    const img = within(popup).getByAltText(`Photo of ${spot.name}`);
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe("IMG");
    expect(within(popup).queryByTestId("photo-placeholder")).not.toBeInTheDocument();
  });

  it("renders no img and a photo-placeholder when the spot has no photoUrl", () => {
    const spot = makeSpot({ photoUrl: undefined });
    render(<SpotMap {...baseProps([spot])} />);
    const popup = screen.getByTestId("popup");

    expect(within(popup).queryByRole("img")).not.toBeInTheDocument();
    expect(within(popup).getByTestId("photo-placeholder")).toBeInTheDocument();
  });

  it("swaps the img for the placeholder when the img fires an error event", () => {
    const spot = makeSpot({ photoUrl: "https://example.com/broken.jpg" });
    render(<SpotMap {...baseProps([spot])} />);
    const popup = screen.getByTestId("popup");

    const img = within(popup).getByAltText(`Photo of ${spot.name}`);
    fireEvent.error(img);

    expect(within(popup).queryByAltText(`Photo of ${spot.name}`)).not.toBeInTheDocument();
    expect(within(popup).getByTestId("photo-placeholder")).toBeInTheDocument();
  });

  it("renders '0 confirmations' for a spot with zero confirmations", () => {
    const spot = makeSpot({ confirmations: 0 });
    render(<SpotMap {...baseProps([spot])} />);
    const popup = screen.getByTestId("popup");

    expect(within(popup).getByText("0 confirmations")).toBeInTheDocument();
  });

  it("renders '1 confirmation' (singular) for a spot with exactly one confirmation", () => {
    const spot = makeSpot({ confirmations: 1 });
    render(<SpotMap {...baseProps([spot])} />);
    const popup = screen.getByTestId("popup");

    expect(within(popup).getByText("1 confirmation")).toBeInTheDocument();
  });

  it("renders 'N confirmations' (plural) for a spot with more than one confirmation", () => {
    const spot = makeSpot({ confirmations: 2, status: "confirmed" });
    render(<SpotMap {...baseProps([spot])} />);
    const popup = screen.getByTestId("popup");

    expect(within(popup).getByText("2 confirmations")).toBeInTheDocument();
  });
});

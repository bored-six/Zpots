import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Spot } from "@/lib/spots";

/**
 * paseo-motion.md fix-round-2, finding 2 -- `createPinIcon`'s `justConfirmed`
 * option must reach the real /mapa write-mode marker, not just exist in
 * lib/pin-icon.ts. Mocks `@/lib/pin-icon` (pure wiring, not "does pin-icon.ts
 * do the right thing" -- that's pin-icon.just-confirmed.test.ts) and reuses
 * SpotMap.wiring.test.tsx's react-leaflet stand-in shape.
 */
const { createPinIconSpy, fakeMap } = vi.hoisted(() => ({
  createPinIconSpy: vi.fn(() => ({ options: { html: "<div/>" } })),
  fakeMap: {
    on: () => {},
    off: () => {},
    setMaxBounds: () => {},
    getPane: () => ({ style: {} }) as unknown as HTMLElement,
    createPane: () => ({ style: {} }) as unknown as HTMLElement,
    addLayer: () => {},
    removeLayer: () => {},
    getZoom: () => 14,
    getContainer: () => document.createElement("div"),
  },
}));

vi.mock("@/lib/pin-icon", () => ({
  createPinIcon: createPinIconSpy,
  createPhotoPinIcon: vi.fn(() => ({ options: { html: "<div/>" } })),
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
  };
});

vi.mock("@/components/CityMask", () => ({
  default: () => <div data-testid="city-mask" />,
}));

import SpotMap from "@/components/SpotMap";

const unconfirmedSpot: Spot = {
  id: "spot-1",
  name: "Rio Hondo Boardwalk",
  note: "Great sunset view.",
  lat: 6.9,
  lng: 122.05,
  status: "unconfirmed",
  confirmations: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function baseProps() {
  return {
    spots: [unconfirmedSpot] as readonly Spot[],
    confirmedSpotIds: new Set<string>(),
    authStatus: "signed-in" as const,
    onCreateSpot: vi.fn().mockResolvedValue(undefined),
    onConfirmSpot: vi.fn().mockResolvedValue(undefined),
    onReportSpot: vi.fn().mockResolvedValue(undefined),
  };
}

describe("SpotMap -- just-confirmed pin wiring", () => {
  it("passes justConfirmed: false for a spot that has not been confirmed this session", () => {
    render(<SpotMap {...baseProps()} />);

    expect(createPinIconSpy).toHaveBeenCalledWith("unconfirmed", { justConfirmed: false });
  });

  it("marks the spot's own pin justConfirmed: true once its confirm click resolves", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<SpotMap {...props} spots={[unconfirmedSpot]} />);

    const popup = screen.getByTestId("popup");
    await user.click(within(popup).getByRole("button", { name: /confirm.*been here/i }));

    await waitFor(() => expect(props.onConfirmSpot).toHaveBeenCalledWith(unconfirmedSpot.id));

    await waitFor(() =>
      expect(createPinIconSpy).toHaveBeenCalledWith("unconfirmed", { justConfirmed: true }),
    );
  });
});

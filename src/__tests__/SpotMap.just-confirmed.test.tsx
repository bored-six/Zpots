import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MapSpot } from "@/lib/spots";

/**
 * paseo-motion.md fix-round-2, finding 2 -- `createPinIcon`'s `justConfirmed`
 * option must reach the real Mi mapa marker, not just exist in
 * lib/pin-icon.ts. Mocks `@/lib/pin-icon` (pure wiring, not "does pin-icon.ts
 * do the right thing" -- that's pin-icon.just-confirmed.test.ts) and reuses
 * SpotMap.density.test.tsx's react-leaflet stand-in shape.
 */
const { createPinIconSpy, fakeMap, markerIconCalls } = vi.hoisted(() => ({
  createPinIconSpy: vi.fn(() => ({ options: { html: "<div/>" } })),
  // Every `icon` prop react-leaflet's real `Marker` ever received, in
  // render order -- lets the stability test below check reference
  // equality across renders, something the old mock (which dropped the
  // `icon` prop entirely) could never catch.
  markerIconCalls: [] as unknown[],
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
    Marker: ({ icon, children }: { icon?: unknown; children?: React.ReactNode }) => {
      markerIconCalls.push(icon);
      return <div data-testid="marker">{children}</div>;
    },
    Popup: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="popup">{children}</div>
    ),
  };
});

vi.mock("@/components/CityMask", () => ({
  default: () => <div data-testid="city-mask" />,
}));

import SpotMap from "@/components/SpotMap";

const unconfirmedSpot: MapSpot = {
  id: "spot-1",
  name: "Rio Hondo Boardwalk",
  note: "Great sunset view.",
  lat: 6.9,
  lng: 122.05,
  status: "unconfirmed",
  confirmations: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  author: { id: "user-1", handle: "kuya_ben", displayName: "Kuya Ben", avatarUrl: null },
  source: "mine",
};

function baseProps() {
  return {
    mapSpots: [unconfirmedSpot] as readonly MapSpot[],
    confirmedSpotIds: new Set<string>(),
    authStatus: "signed-in" as const,
    onConfirmSpot: vi.fn().mockResolvedValue(undefined),
    onReportSpot: vi.fn().mockResolvedValue(undefined),
  };
}

describe("SpotMap -- just-confirmed pin wiring", () => {
  it("passes justConfirmed: false for a spot that has not been confirmed this session", () => {
    render(<SpotMap {...baseProps()} />);

    expect(createPinIconSpy).toHaveBeenCalledWith(
      "unconfirmed",
      expect.objectContaining({ justConfirmed: false, size: 32 }),
    );
  });

  it("marks the spot's own pin justConfirmed: true once its confirm click resolves", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<SpotMap {...props} mapSpots={[unconfirmedSpot]} />);

    const popup = screen.getByTestId("popup");
    await user.click(within(popup).getByRole("button", { name: /confirm.*been here/i }));

    await waitFor(() => expect(props.onConfirmSpot).toHaveBeenCalledWith(unconfirmedSpot.id));

    await waitFor(() =>
      expect(createPinIconSpy).toHaveBeenCalledWith(
        "unconfirmed",
        expect.objectContaining({ justConfirmed: true, size: 32 }),
      ),
    );
  });

  it("threads the density size on every call and never changes it on confirm", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<SpotMap {...props} mapSpots={[unconfirmedSpot]} />);

    const popup = screen.getByTestId("popup");
    await user.click(within(popup).getByRole("button", { name: /confirm.*been here/i }));

    await waitFor(() => expect(props.onConfirmSpot).toHaveBeenCalledWith(unconfirmedSpot.id));

    expect(
      createPinIconSpy.mock.calls.every(([, options]) => (options as { size?: unknown }).size === 32),
    ).toBe(true);
    expect(
      createPinIconSpy.mock.calls.every(
        ([, options]) => typeof (options as { justConfirmed?: unknown }).justConfirmed === "boolean",
      ),
    ).toBe(true);
  });

  /**
   * paseo-motion.md fix-round-2, finding 1 -- SpotMap called `createPinIcon`
   * inline in JSX inside the marker `.map()`, so it ran again for every
   * spot on every re-render whether or not that spot's `status`/
   * `justConfirmed` changed. react-leaflet's `Marker` only calls `setIcon`
   * when `props.icon !== prevProps.icon` (a reference check, verified
   * against node_modules/react-leaflet/lib/Marker.js), and Leaflet's
   * `DivIcon.createIcon` unconditionally does `div.innerHTML = options.html`
   * (verified against node_modules/leaflet/src/layer/marker/DivIcon.js) --
   * so a fresh icon object on an unrelated re-render tears down and
   * rebuilds the marker's DOM, restarting the one-shot
   * `.zpots-pin-icon--just-confirmed` halo animation. The old mock's
   * `Marker: ({ children }) => <div data-testid="marker">{children}</div>`
   * dropped the `icon` prop entirely and could never have caught this.
   */
  it("keeps the spot's own pin icon reference stable across an unrelated re-render", () => {
    const props = baseProps();
    const { rerender } = render(<SpotMap {...props} mapSpots={[unconfirmedSpot]} />);

    const callsAfterFirstRender = createPinIconSpy.mock.calls.length;
    const iconAfterFirstRender = markerIconCalls.at(-1);

    // Unrelated re-render: a new `openSpotId` value -- not one of
    // createPinIcon's inputs (status, justConfirmed) -- with the same spot.
    rerender(<SpotMap {...props} mapSpots={[unconfirmedSpot]} openSpotId="not-this-spot" />);

    expect(createPinIconSpy.mock.calls.length).toBe(callsAfterFirstRender);
    expect(markerIconCalls.at(-1)).toBe(iconAfterFirstRender);
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { MapSpot } from "@/lib/spots";

/**
 * "Al tocar" (spec fix): confirms the same signed-out gating SpotMap
 * already applies to write-mode `spots` popups (SpotMap.wiring.test.tsx's
 * "auth gating" block) also protects `mapSpots` popups -- the read-only
 * personal-map/preview markers Mi mapa renders. Two things this locks in:
 * (1) a `mapSpots` popup with no `onConfirmSpot`/`onReportSpot` renders no
 * action controls at all (the existing "preview spots are read-only"
 * behavior -- must not regress), and (2) a caller that *does* wire those
 * callbacks onto `mapSpots` still gets the sign-in prompt instead of the
 * callback firing while signed out, via the same `handleConfirm`/
 * `handleReport` gate the write-mode popups use.
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
    Polygon: () => <div data-testid="polygon" />,
    Polyline: () => <div data-testid="polyline" />,
    useMap: () => ({
      createPane: vi.fn(() => ({ style: {} }) as unknown as HTMLElement),
      getPane: vi.fn(() => ({ style: {} }) as unknown as HTMLElement),
    }),
  };
});

import SpotMap from "@/components/SpotMap";

function makeMapSpot(overrides: Partial<MapSpot> = {}): MapSpot {
  return {
    id: "spot-1",
    name: "Fort Pilar",
    note: "Historic fort and shrine.",
    lat: 6.9098,
    lng: 122.079,
    status: "unconfirmed",
    confirmations: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    author: { id: "user-1", handle: "kuya_ben", displayName: "Kuya Ben", avatarUrl: null },
    source: "preview",
    ...overrides,
  };
}

describe("SpotMap mapSpots popups -- read-only when no handlers are wired", () => {
  it("renders no Confirm or Report control for a mapSpots popup when onConfirmSpot/onReportSpot are omitted", () => {
    render(<SpotMap authStatus="signed-out" mapSpots={[makeMapSpot()]} />);

    expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /report/i })).not.toBeInTheDocument();
  });
});

describe("SpotMap mapSpots popups -- signed-out gating when handlers are wired", () => {
  it("signed-out Confirm click on a mapSpots popup opens the sign-in prompt and does not call onConfirmSpot", async () => {
    const user = userEvent.setup();
    const onConfirmSpot = vi.fn().mockResolvedValue(undefined);
    render(
      <SpotMap
        authStatus="signed-out"
        mapSpots={[makeMapSpot()]}
        onConfirmSpot={onConfirmSpot}
      />,
    );

    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(screen.getByRole("heading", { name: /sign in to confirm/i })).toBeInTheDocument();
    expect(onConfirmSpot).not.toHaveBeenCalled();
  });

  it("signed-out Report submit on a mapSpots popup opens the sign-in prompt and does not call onReportSpot", async () => {
    const user = userEvent.setup();
    const onReportSpot = vi.fn().mockResolvedValue(undefined);
    render(
      <SpotMap
        authStatus="signed-out"
        mapSpots={[makeMapSpot()]}
        onReportSpot={onReportSpot}
      />,
    );

    await user.click(screen.getByRole("button", { name: /report/i }));
    await user.click(screen.getByRole("button", { name: /submit report/i }));

    expect(screen.getByText(/sign in to report/i)).toBeInTheDocument();
    expect(onReportSpot).not.toHaveBeenCalled();
  });
});

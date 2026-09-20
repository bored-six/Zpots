import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Spot } from "@/lib/spots";
import { COPY } from "@/lib/copy";

/**
 * Adversarial pass on SpotMap's outside-city tap guard (spec Task 1's
 * "defensive tap guard" -- SpotMap.tsx's handleMapClick). Own copy of the
 * react-leaflet fake-map harness from SpotMap.wiring.test.tsx (that file is
 * the frozen regression net and isn't touched here) so a tap can be
 * simulated without rendering real Leaflet in jsdom.
 */
const { fakeMap, emitMapClick } = vi.hoisted(() => {
  const handlers: Record<string, Array<(event: unknown) => void>> = {};
  const map = {
    on: (event: string, handler: (e: unknown) => void) => {
      (handlers[event] ??= []).push(handler);
    },
    off: (event: string, handler: (e: unknown) => void) => {
      handlers[event] = (handlers[event] ?? []).filter((h) => h !== handler);
    },
    setMaxBounds: () => {},
  };
  const emitMapClick = (lat: number, lng: number) => {
    for (const handler of handlers["click"] ?? []) {
      handler({ latlng: { lat, lng } });
    }
  };
  return { fakeMap: map, emitMapClick };
});

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
    Marker: ({ position, children }: { position: unknown; children?: React.ReactNode }) => (
      <div data-testid="marker" data-position={JSON.stringify(position)}>
        {children}
      </div>
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

function baseProps() {
  return {
    spots: [] as readonly Spot[],
    confirmedSpotIds: new Set<string>(),
    authStatus: "signed-in" as const,
    onCreateSpot: vi.fn().mockResolvedValue(undefined),
    onConfirmSpot: vi.fn().mockResolvedValue(undefined),
    onReportSpot: vi.fn().mockResolvedValue(undefined),
  };
}

// A handful of real, well-outside-the-box coordinates plus one just a hair
// past the east edge, so this doesn't only prove the guard works for
// obviously-far-away taps.
const OUTSIDE_CITY_TAPS: Array<[label: string, lat: number, lng: number]> = [
  ["Manila", 14.6, 120.98],
  ["Isabela, Basilan", 6.7, 121.97],
  ["a hair past the east edge", 6.9, 122.5801],
];

describe("adversarial", () => {
  describe.each(OUTSIDE_CITY_TAPS)("SpotMap tap guard -- tap at %s (%s, %s)", (_label, lat, lng) => {
    it("does not open the add-pin modal and shows the outside-city banner instead", async () => {
      const user = userEvent.setup();
      const props = baseProps();
      render(<SpotMap {...props} spots={[]} />);

      await user.click(screen.getByRole("button", { name: /add a spot/i }));
      expect(screen.getByText(/tap the map/i)).toBeInTheDocument();

      act(() => {
        emitMapClick(lat, lng);
      });

      // The add-pin form never opens for this tap.
      expect(screen.queryByLabelText((c) => c.trim().toLowerCase() === "name")).not.toBeInTheDocument();
      expect(props.onCreateSpot).not.toHaveBeenCalled();

      // The outside-city banner (COPY.outsideCity) replaces the tap hint.
      expect(screen.getByText(COPY.outsideCity.cv)).toBeInTheDocument();
      expect(screen.getByText(COPY.outsideCity.en)).toBeInTheDocument();
      expect(screen.queryByText(COPY.tapToPlace.cv)).not.toBeInTheDocument();
    });
  });

  it("a subsequent in-bounds tap after an out-of-bounds one still opens the form normally", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<SpotMap {...props} spots={[]} />);

    await user.click(screen.getByRole("button", { name: /add a spot/i }));

    act(() => {
      emitMapClick(14.6, 120.98); // outside -- Manila
    });
    expect(screen.getByText(COPY.outsideCity.en)).toBeInTheDocument();

    act(() => {
      emitMapClick(6.91, 122.06); // inside Zamboanga City
    });

    expect(screen.getByLabelText((c) => c.trim().toLowerCase() === "name")).toBeInTheDocument();
  });

  describe("FAB accessible name", () => {
    it("idle FAB's accessible name is COPY.addSpot.en, armed FAB's is COPY.cancel.en -- both derived from COPY, not a hardcoded literal", async () => {
      const user = userEvent.setup();
      const props = baseProps();
      render(<SpotMap {...props} spots={[]} />);

      const idleFab = screen.getByRole("button", { name: new RegExp(COPY.addSpot.en, "i") });
      expect(idleFab).toBeInTheDocument();

      await user.click(idleFab);

      expect(screen.getByRole("button", { name: new RegExp(COPY.cancel.en, "i") })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: new RegExp(COPY.addSpot.en, "i") })).not.toBeInTheDocument();
    });
  });
});

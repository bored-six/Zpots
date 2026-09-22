import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapSpot } from "@/lib/spots";

/**
 * grabado-pins spec, section 10.8, revised by section 14.10 for revision 2
 * -- `SpotMap`'s density-responsive icon sizing (section 5), now with no
 * photo pin anywhere and a four-tier ladder [32, 22, 16, 10]. Mocks
 * `@/lib/pin-icon` (pure wiring, not "does pin-icon.ts do the right
 * thing" -- that's pin-icon.size/category/seal.test.ts) and reuses
 * `SpotMap.just-confirmed.test.tsx`'s react-leaflet stand-in shape, with
 * `getZoom` backed by a mutable module-level zoom so a test can move it and
 * fire the captured `zoomend` handler.
 *
 * THIS FILE IS EXPECTED TO FAIL RED against the revision-1 implementation:
 * `SpotMap.tsx` still routes photo-eligible sources through
 * `createPhotoPinIcon`, still includes `photoUrl` in the `mapSpots` cache
 * key, and the ladder's tier numbering is still five rungs off by one.
 */
const { createPinIconSpy, fakeMap, markerIconCalls, zoomState, zoomendHandlers } = vi.hoisted(() => {
  const zoomState = { zoom: 14 };
  const zoomendHandlers: Array<() => void> = [];
  // Every `icon` prop react-leaflet's real `Marker` ever received, in
  // render order -- a mock that dropped the `icon` prop entirely could
  // never catch an identity-stability regression.
  const markerIconCalls: unknown[] = [];
  const fakeMap = {
    on: (event: string, fn: () => void) => {
      if (event === "zoomend") zoomendHandlers.push(fn);
    },
    off: () => {},
    setMaxBounds: () => {},
    getPane: () => ({ style: {} }) as unknown as HTMLElement,
    createPane: () => ({ style: {} }) as unknown as HTMLElement,
    addLayer: () => {},
    removeLayer: () => {},
    getZoom: () => zoomState.zoom,
    getContainer: () => document.createElement("div"),
  };

  return {
    createPinIconSpy: vi.fn(() => ({ options: { html: "<div/>" } })),
    markerIconCalls,
    fakeMap,
    zoomState,
    zoomendHandlers,
  };
});

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

// Fixtures A/B from spec section 5.3 -- A-B is ~189m apart, which the
// worked table puts at tier 3 (16px) at z14 and the ceiling at z16. `mine`
// with no photoUrl renders through `iconForMapSpot`'s plain-status fallback,
// the same createPinIcon(spot.status, ...) path a write-mode spot used to.
const SPOT_A: MapSpot = {
  id: "spot-a",
  name: "Spot A",
  note: "note",
  lat: 6.9214,
  lng: 122.079,
  status: "unconfirmed",
  confirmations: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  author: { id: "user-1", handle: "kuya_ben", displayName: "Kuya Ben", avatarUrl: null },
  source: "mine",
};

const SPOT_B: MapSpot = {
  id: "spot-b",
  name: "Spot B",
  note: "note",
  lat: 6.9231,
  lng: 122.079,
  status: "unconfirmed",
  confirmations: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  author: { id: "user-1", handle: "kuya_ben", displayName: "Kuya Ben", avatarUrl: null },
  source: "mine",
};

function makeMapSpot(overrides: Partial<MapSpot>): MapSpot {
  return {
    id: "map-spot",
    name: "Map spot",
    note: "note",
    lat: 6.9214,
    lng: 122.079,
    status: "unconfirmed",
    confirmations: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    author: { id: "user-1", handle: "kuya_ben", displayName: "Kuya Ben", avatarUrl: null },
    source: "mine",
    ...overrides,
  };
}

function lastSize(spy: typeof createPinIconSpy): number | undefined {
  const lastCall = spy.mock.calls.at(-1) as [unknown, { size?: number }?] | undefined;
  return lastCall?.[1]?.size;
}

beforeEach(() => {
  vi.resetAllMocks();
  createPinIconSpy.mockImplementation(() => ({ options: { html: "<div/>" } }));
  zoomState.zoom = 14;
  zoomendHandlers.length = 0;
  markerIconCalls.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SpotMap -- density-responsive pin sizing", () => {
  it("two spots ~190m apart both size to tier 2 (16px) at the default zoom", () => {
    render(<SpotMap authStatus="signed-in" mapSpots={[SPOT_A, SPOT_B]} />);

    const sizes = createPinIconSpy.mock.calls.map(
      (call) => (call[1] as { size?: number } | undefined)?.size,
    );
    expect(sizes).toEqual([16, 16]);
  });

  it("recomputes to tier 0 (32px) after a zoomend event bumps the zoom to 16", () => {
    render(<SpotMap authStatus="signed-in" mapSpots={[SPOT_A, SPOT_B]} />);

    zoomState.zoom = 16;
    act(() => {
      zoomendHandlers.forEach((fn) => fn());
    });

    const lastTwoSizes = createPinIconSpy.mock.calls
      .slice(-2)
      .map((call) => (call[1] as { size?: number } | undefined)?.size);
    expect(lastTwoSizes).toEqual([32, 32]);
  });

  it("a lone spot rides all the way up to tier 0 (32px), since nothing is nearby", () => {
    render(<SpotMap authStatus="signed-in" mapSpots={[SPOT_A]} />);

    expect(lastSize(createPinIconSpy)).toBe(32);
  });

  it("at z14 a mine-with-photo spot and a saved spot both render as plain 16px glyphs, photoUrl never reaches the icon options", () => {
    const mine = makeMapSpot({ id: "map-a", source: "mine", photoUrl: "https://example.com/p.jpg" });
    const saved = makeMapSpot({
      id: "map-b",
      source: "saved",
      lat: 6.9231,
      lng: 122.079,
    });

    render(<SpotMap authStatus="signed-in" mapSpots={[mine, saved]} />);

    const calls = createPinIconSpy.mock.calls as [unknown, Record<string, unknown>?][];
    const sizes = calls.map((call) => (call[1] as { size?: number } | undefined)?.size);
    expect(sizes).toEqual([16, 16]);
    for (const call of calls) {
      expect(call[1]).not.toHaveProperty("photoUrl");
    }
  });

  it("at z16 both spots ride to size 32 and forward their own category, no photo option anywhere", () => {
    zoomState.zoom = 16;
    const mine = makeMapSpot({ id: "map-a", source: "mine", category: "come" });
    const saved = makeMapSpot({
      id: "map-b",
      source: "saved",
      lat: 6.9231,
      lng: 122.079,
      category: "agua",
    });

    render(<SpotMap authStatus="signed-in" mapSpots={[mine, saved]} />);

    expect(createPinIconSpy).toHaveBeenCalledWith(
      "unconfirmed",
      expect.objectContaining({ size: 32, category: "come" }),
    );
    expect(createPinIconSpy).toHaveBeenCalledWith(
      "unconfirmed",
      expect.objectContaining({ size: 32, category: "agua" }),
    );
  });

  it("hiding the saved source via sourceFilter leaves the mine spot alone, riding to size 32 via createPinIcon", () => {
    const mine = makeMapSpot({ id: "map-a", source: "mine", photoUrl: "https://example.com/p.jpg" });
    const saved = makeMapSpot({
      id: "map-b",
      source: "saved",
      lat: 6.9231,
      lng: 122.079,
    });

    render(
      <SpotMap
        authStatus="signed-in"
        mapSpots={[mine, saved]}
        sourceFilter={new Set(["mine"])}
      />,
    );

    expect(createPinIconSpy).toHaveBeenCalledWith(
      "unconfirmed",
      expect.objectContaining({ size: 32 }),
    );
  });

  it("a been-source spot always renders confirmed, regardless of its own status", () => {
    const been = makeMapSpot({ id: "map-been", source: "been", status: "unconfirmed" });

    render(<SpotMap authStatus="signed-in" mapSpots={[been]} />);

    expect(createPinIconSpy).toHaveBeenCalledWith("confirmed", expect.anything());
  });

  it("a saved-source spot always renders unconfirmed, even when its real status is confirmed (E22)", () => {
    const saved = makeMapSpot({ id: "map-saved", source: "saved", status: "confirmed" });

    render(<SpotMap authStatus="signed-in" mapSpots={[saved]} />);

    expect(createPinIconSpy).toHaveBeenCalledWith("unconfirmed", expect.anything());
  });

  it("keeps the icon reference stable across an unrelated prop change and a same-zoom zoomend", () => {
    const { rerender } = render(<SpotMap authStatus="signed-in" mapSpots={[SPOT_A, SPOT_B]} />);

    expect(createPinIconSpy).toHaveBeenCalledWith(
      "unconfirmed",
      expect.objectContaining({ size: 16 }),
    );

    const iconAfterFirstRender = markerIconCalls.at(-1);

    rerender(
      <SpotMap authStatus="signed-in" mapSpots={[SPOT_A, SPOT_B]} openSpotId="not-this-spot" />,
    );
    expect(markerIconCalls.at(-1)).toBe(iconAfterFirstRender);

    act(() => {
      zoomendHandlers.forEach((fn) => fn());
    });
    expect(markerIconCalls.at(-1)).toBe(iconAfterFirstRender);
  });

  it("forwards a spot's category to createPinIcon", () => {
    const categorised: MapSpot = { ...SPOT_A, category: "mira" };
    render(<SpotMap authStatus="signed-in" mapSpots={[categorised]} />);

    expect(createPinIconSpy).toHaveBeenCalledWith(
      "unconfirmed",
      expect.objectContaining({ category: "mira" }),
    );
  });

  it("flags justConfirmed for 1200ms after a confirm resolves, then clears it", async () => {
    vi.useFakeTimers();
    const onConfirmSpot = vi.fn().mockResolvedValue(undefined);

    render(<SpotMap authStatus="signed-in" mapSpots={[SPOT_A]} onConfirmSpot={onConfirmSpot} />);

    const popup = screen.getByTestId("popup");
    const confirmButton = within(popup).getByRole("button", { name: /confirm.*been here/i });
    // `fireEvent` (not `userEvent`) on purpose: userEvent schedules its own
    // real-time pointer delays that don't reliably advance under fake
    // timers, which hung this test at its 5s default timeout instead of
    // failing on an assertion. `fireEvent.click` dispatches synchronously,
    // and the surrounding `act` flushes the async handleConfirm chain.
    await act(async () => {
      fireEvent.click(confirmButton);
      await Promise.resolve();
    });

    expect(onConfirmSpot).toHaveBeenCalledWith(SPOT_A.id);
    expect(createPinIconSpy).toHaveBeenCalledWith(
      "unconfirmed",
      expect.objectContaining({ justConfirmed: true, size: 32 }),
    );

    await vi.advanceTimersByTimeAsync(1200);

    expect(createPinIconSpy).toHaveBeenCalledWith(
      "unconfirmed",
      expect.objectContaining({ justConfirmed: false, size: 32 }),
    );
  });

  it("clears the pending justConfirmed timer on unmount so no state update fires after unmounting", async () => {
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const onConfirmSpot = vi.fn().mockResolvedValue(undefined);

    const { unmount } = render(
      <SpotMap authStatus="signed-in" mapSpots={[SPOT_A]} onConfirmSpot={onConfirmSpot} />,
    );

    const popup = screen.getByTestId("popup");
    const confirmButton = within(popup).getByRole("button", { name: /confirm.*been here/i });
    await act(async () => {
      fireEvent.click(confirmButton);
      await Promise.resolve();
    });

    expect(createPinIconSpy).toHaveBeenCalledWith(
      "unconfirmed",
      expect.objectContaining({ justConfirmed: true, size: 32 }),
    );

    unmount();

    await vi.advanceTimersByTimeAsync(1200);

    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining("Can't perform a React state update on an unmounted component"),
    );

    consoleError.mockRestore();
  });
});

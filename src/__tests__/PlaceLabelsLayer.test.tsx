import type { Map as LeafletMap } from "leaflet";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { visiblePlaceLabels } from "@/lib/places";
import { ZAMBOANGA_PLACES } from "@/data/zamboanga-places";

/**
 * PlaceLabelsLayer takes the live Leaflet map as an explicit `map` prop and
 * never calls `useMap()` (D4 in .claude/prds/pergamino-map.md), so this
 * file never mocks `react-leaflet` -- it hands the component a hand-written
 * fake map, the same shape as the real Leaflet API surface the component
 * touches (`createPane`/`getPane`/`getZoom`/`on`/`off`/`addLayer`/
 * `removeLayer`), and asserts on how it is called. `leaflet` itself is not
 * mocked: L.marker/L.layerGroup/L.divIcon only build plain JS objects until
 * something calls their `onAdd`, which our fake map's `addLayer` never
 * does -- so no real Leaflet rendering ever touches jsdom.
 */

import PlaceLabelsLayer from "@/components/PlaceLabelsLayer";

type Listener = (...args: unknown[]) => void;

interface FakePane {
  style: Record<string, string>;
}

function createFakeMap(initialZoom: number, options: { seedPane?: boolean } = {}) {
  const panes = new Map<string, FakePane>();
  if (options.seedPane) {
    panes.set("placeLabels", { style: {} });
  }
  const listeners = new Map<string, Set<Listener>>();
  let zoom = initialZoom;

  const map = {
    createPane: vi.fn((name: string) => {
      const pane: FakePane = { style: {} };
      panes.set(name, pane);
      return pane as unknown as HTMLElement;
    }),
    getPane: vi.fn((name: string) => panes.get(name) as unknown as HTMLElement | undefined),
    getZoom: vi.fn(() => zoom),
    on: vi.fn((event: string, handler: Listener) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return map;
    }),
    off: vi.fn((event: string, handler: Listener) => {
      listeners.get(event)?.delete(handler);
      return map;
    }),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
  };

  return {
    map: map as unknown as LeafletMap,
    raw: map,
    pane: (name: string) => panes.get(name),
    setZoom: (next: number) => {
      zoom = next;
    },
    fireZoomEnd: () => {
      listeners.get("zoomend")?.forEach((handler) => handler());
    },
    listenerCount: (event: string) => listeners.get(event)?.size ?? 0,
  };
}

function lastAddedGroup(raw: ReturnType<typeof createFakeMap>["raw"]) {
  const calls = raw.addLayer.mock.calls;
  const layer = calls[calls.length - 1]?.[0] as { getLayers: () => unknown[] };
  return layer;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PlaceLabelsLayer", () => {
  it("map === null: renders nothing, creates no pane, adds no layer", () => {
    const { container } = render(<PlaceLabelsLayer map={null} />);

    expect(container.firstChild).toBeNull();
  });

  it("with a fake map at zoom 14: creates the placeLabels pane at zIndex 450 and adds one marker per visible label", () => {
    const fake = createFakeMap(14);

    render(<PlaceLabelsLayer map={fake.map} />);

    expect(fake.raw.createPane).toHaveBeenCalledWith("placeLabels");
    expect(fake.pane("placeLabels")?.style.zIndex).toBe("450");

    const expected = visiblePlaceLabels(ZAMBOANGA_PLACES, 14).length;
    const group = lastAddedGroup(fake.raw);
    expect(group.getLayers()).toHaveLength(expected);
  });

  it("does not recreate the pane when getPane already returns one -- idempotent, same contract as CityMask", () => {
    const fake = createFakeMap(14, { seedPane: true });

    render(<PlaceLabelsLayer map={fake.map} />);

    expect(fake.raw.createPane).not.toHaveBeenCalled();
  });

  it("rebuilds the marker group when zoomend fires at a new zoom", () => {
    const fake = createFakeMap(14);
    render(<PlaceLabelsLayer map={fake.map} />);

    const firstGroup = lastAddedGroup(fake.raw);

    fake.setZoom(15);
    fake.fireZoomEnd();

    const expected = visiblePlaceLabels(ZAMBOANGA_PLACES, 15).length;
    const secondGroup = lastAddedGroup(fake.raw);

    expect(secondGroup).not.toBe(firstGroup);
    expect(secondGroup.getLayers()).toHaveLength(expected);
    expect(fake.raw.removeLayer).toHaveBeenCalledWith(firstGroup);
  });

  it("does not rebuild on a zoomend at the same zoom -- no churn on every pan", () => {
    const fake = createFakeMap(14);
    render(<PlaceLabelsLayer map={fake.map} />);

    expect(fake.raw.addLayer).toHaveBeenCalledTimes(1);

    fake.fireZoomEnd();

    expect(fake.raw.addLayer).toHaveBeenCalledTimes(1);
    expect(fake.raw.removeLayer).not.toHaveBeenCalled();
  });

  it("every marker is created with interactive: false and keyboard: false", () => {
    const fake = createFakeMap(14);
    render(<PlaceLabelsLayer map={fake.map} />);

    const group = lastAddedGroup(fake.raw);
    const markers = group.getLayers() as Array<{
      options: { interactive?: boolean; keyboard?: boolean };
    }>;

    expect(markers.length).toBeGreaterThan(0);
    for (const marker of markers) {
      expect(marker.options.interactive).toBe(false);
      expect(marker.options.keyboard).toBe(false);
    }
  });

  it("unmount removes the layer group and calls map.off('zoomend', ...) with the handler it registered -- no leak across the deck's remounts", () => {
    const fake = createFakeMap(14);
    const { unmount } = render(<PlaceLabelsLayer map={fake.map} />);

    const group = lastAddedGroup(fake.raw);
    const [, registeredHandler] = fake.raw.on.mock.calls.find(([event]) => event === "zoomend")!;
    expect(fake.listenerCount("zoomend")).toBe(1);

    unmount();

    expect(fake.raw.off).toHaveBeenCalledWith("zoomend", registeredHandler);
    expect(fake.raw.removeLayer).toHaveBeenCalledWith(group);
    expect(fake.listenerCount("zoomend")).toBe(0);
  });
});

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Map as LeafletMap } from "leaflet";

/**
 * Code review finding 1 (Pergamino map). `attach()` in BasemapLayer.tsx
 * awaits `Promise.all([probeBasemapArchive(url), import("protomaps-leaflet")])`
 * with no try/catch of its own and is called fire-and-forget. A genuinely
 * rejecting dynamic import (CDN blip, ad blocker, stale chunk after a
 * redeploy) must still land the component in the raster fallback -- exactly
 * the same outcome as a failed probe -- rather than leaving it blank
 * forever.
 *
 * `protomaps-leaflet` is mocked to always throw during module evaluation --
 * the standard way to make a dynamic `import()` reject in Vitest -- so this
 * file is kept separate from BasemapLayer.test.tsx, which needs the normal
 * (resolving) mock for its other cases. Per-file module isolation means
 * this always-throwing mock never leaks into that file.
 */

vi.mock("protomaps-leaflet", () => {
  throw new Error("Failed to fetch dynamically imported module");
});

const { probeMock } = vi.hoisted(() => ({ probeMock: vi.fn() }));

vi.mock("@/lib/basemap-source", () => ({ probeBasemapArchive: probeMock }));

vi.mock("react-leaflet", () => ({
  TileLayer: (props: { url: unknown; attribution: unknown }) => (
    <div
      data-testid="tile-layer"
      data-url={String(props.url)}
      data-attribution={String(props.attribution)}
    />
  ),
}));

import BasemapLayer from "@/components/BasemapLayer";
import { TILE_ATTRIBUTION, TILE_URL } from "@/lib/map-config";

type FakeMap = LeafletMap & { addLayer: ReturnType<typeof vi.fn>; removeLayer: ReturnType<typeof vi.fn> };

function createFakeMap(): FakeMap {
  return {
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
  } as unknown as FakeMap;
}

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  probeMock.mockReset();
});

afterEach(() => {
  delete (window as Window & { L?: unknown }).L;
});

describe("BasemapLayer -- rejected protomaps-leaflet import()", () => {
  it("renders the raster TileLayer fallback and calls onModeChange(\"raster\") exactly once", async () => {
    probeMock.mockResolvedValue("ok");
    const map = createFakeMap();
    const onModeChange = vi.fn();

    render(<BasemapLayer map={map} onModeChange={onModeChange} />);

    const tile = await screen.findByTestId("tile-layer");
    expect(tile.getAttribute("data-url")).toBe(TILE_URL);
    expect(tile.getAttribute("data-attribution")).toBe(TILE_ATTRIBUTION);
    expect(onModeChange).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenCalledWith("raster");
    expect(map.addLayer).not.toHaveBeenCalled();
  });

  it("a rejection arriving after unmount sets no state (respects the cancelled guard)", async () => {
    probeMock.mockResolvedValue("ok");
    const map = createFakeMap();
    const onModeChange = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const { unmount } = render(<BasemapLayer map={map} onModeChange={onModeChange} />);
    unmount();
    await flushMicrotasks();

    expect(onModeChange).not.toHaveBeenCalled();
    expect(map.addLayer).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

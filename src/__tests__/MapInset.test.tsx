import { useEffect, useState, type ComponentType } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LatLng } from "@/lib/geo";

// MapInset.tsx wraps its own inner component in `next/dynamic` (unlike
// SpotMap, which is dynamic-imported by its *consumers* instead). We
// replace next/dynamic's default export with a stand-in that resolves the
// loader promise and renders the real inner component once it settles, so
// tests don't have to deal with an actual code-split chunk.
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<{ default: ComponentType<Record<string, unknown>> }>) => {
    function DynamicWrapper(props: Record<string, unknown>) {
      const [Comp, setComp] = useState<ComponentType<Record<string, unknown>> | null>(null);

      useEffect(() => {
        let cancelled = false;
        loader().then((mod) => {
          if (!cancelled) setComp(() => mod.default);
        });
        return () => {
          cancelled = true;
        };
      }, []);

      return Comp ? <Comp {...props} /> : null;
    }

    return DynamicWrapper;
  },
}));

// flyTo is asserted on directly, so it has to be a spy that survives
// vi.mock's hoisting (a plain outer `let` wouldn't be initialized yet when
// the mock factory below runs).
const { flyToSpy } = vi.hoisted(() => ({ flyToSpy: vi.fn() }));

vi.mock("react-leaflet", async () => {
  const React = await import("react");
  return {
    MapContainer: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="map-container">{children}</div>
    ),
    TileLayer: () => <div data-testid="tile-layer" />,
    Marker: ({ position }: { position: unknown }) => (
      <div data-testid="marker" data-position={JSON.stringify(position)} />
    ),
    useMap: () => ({
      flyTo: flyToSpy,
      getZoom: () => 16,
    }),
  };
});

vi.mock("@/components/CityMask", () => ({
  default: () => <div data-testid="city-mask" />,
}));

import MapInset from "@/components/MapInset";

describe("MapInset", () => {
  it("renders a CityMask inside the map container", async () => {
    render(
      <MapInset
        center={{ lat: 6.9042, lng: 122.0812 }}
        status="unconfirmed"
        onExpand={vi.fn()}
      />,
    );

    const mapContainer = await screen.findByTestId("map-container");
    const cityMask = await screen.findByTestId("city-mask");

    expect(mapContainer).toContainElement(cityMask);
  });

  it("calls flyTo with the finite center it was given", async () => {
    flyToSpy.mockClear();
    render(
      <MapInset
        center={{ lat: 6.9042, lng: 122.0812 }}
        status="unconfirmed"
        onExpand={vi.fn()}
      />,
    );

    await waitFor(() => expect(flyToSpy).toHaveBeenCalledWith([6.9042, 122.0812], 16, expect.anything()));
  });

  // Regression coverage for "Invalid LatLng object: (NaN, NaN)" (a full-page
  // runtime crash): a caller can hand MapInset a center before any real spot
  // is active (page.tsx's right-column map before the first card loads) or
  // a row whose coordinates didn't survive the trip from the database. Either
  // way, MapInset must degrade to rendering nothing rather than handing
  // Leaflet a non-finite LatLng.
  it.each<{ name: string; center: LatLng | undefined }>([
    { name: "center is undefined", center: undefined },
    { name: "lat is NaN", center: { lat: NaN, lng: 122.0812 } },
    { name: "lng is NaN", center: { lat: 6.9042, lng: NaN } },
    { name: "lat is Infinity", center: { lat: Infinity, lng: 122.0812 } },
    { name: "lng is -Infinity", center: { lat: 6.9042, lng: -Infinity } },
  ])("renders nothing and never calls flyTo when $name", async ({ center }) => {
    flyToSpy.mockClear();
    render(<MapInset center={center as LatLng} status="unconfirmed" onExpand={vi.fn()} />);

    // Give the dynamic loader + any effects a chance to run before asserting
    // the negative -- there's nothing to `findBy`, so a short wait is the
    // only way to let a would-be crash actually surface here.
    await waitFor(() => expect(flyToSpy).not.toHaveBeenCalled());

    expect(screen.queryByTestId("map-container")).not.toBeInTheDocument();
  });
});

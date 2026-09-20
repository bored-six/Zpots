import { useEffect, useState, type ComponentType } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
      flyTo: () => {},
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
});

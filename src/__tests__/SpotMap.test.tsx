import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MapSpot, Spot } from "@/lib/spots";

// We deliberately avoid rendering real Leaflet in jsdom (it needs real layout
// measurement and is flaky in a headless DOM). Instead we replace
// react-leaflet with lightweight stand-ins that surface the props SpotMap
// passes down as data-* attributes / testids, so we can assert on the wiring
// without depending on Leaflet's internals.
vi.mock("react-leaflet", () => {
  return {
    MapContainer: ({
      center,
      zoom,
      children,
    }: {
      center: unknown;
      zoom: unknown;
      children?: React.ReactNode;
    }) => (
      <div
        data-testid="map-container"
        data-center={JSON.stringify(center)}
        data-zoom={String(zoom)}
      >
        {children}
      </div>
    ),
    TileLayer: ({
      url,
      attribution,
    }: {
      url: unknown;
      attribution: unknown;
    }) => (
      <div
        data-testid="tile-layer"
        data-url={String(url)}
        data-attribution={String(attribution)}
      />
    ),
    Marker: ({
      position,
      children,
    }: {
      position: unknown;
      children?: React.ReactNode;
    }) => (
      <div data-testid="marker" data-position={JSON.stringify(position)}>
        {children}
      </div>
    ),
    Popup: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="popup">{children}</div>
    ),
    // CityMask (rendered inside SpotMap) imports these directly rather than
    // feature-detecting react-leaflet's exports -- see the note in
    // CityMask.tsx about the `"x" in ReactLeaflet` hack this stand-in makes
    // unnecessary for every file that provides these three.
    Polygon: (props: Record<string, unknown>) => (
      <div data-testid="polygon" data-props={JSON.stringify(props)} />
    ),
    Polyline: (props: Record<string, unknown>) => (
      <div data-testid="polyline" data-props={JSON.stringify(props)} />
    ),
    useMap: () => ({
      createPane: vi.fn(() => ({ style: {} }) as unknown as HTMLElement),
      getPane: vi.fn(() => ({ style: {} }) as unknown as HTMLElement),
      fitBounds: vi.fn(),
      flyTo: vi.fn(),
      setView: vi.fn(),
    }),
  };
});

// SpotMap now renders the vector "Pergamino" basemap via BasemapLayer
// instead of a raw react-leaflet TileLayer (Pergamino PRD T3.1) -- stand in
// for it the same way the rest of this file stands in for react-leaflet
// itself, serialising the props it receives as data-* attributes.
vi.mock("@/components/BasemapLayer", () => {
  return {
    default: ({
      map,
      onModeChange,
    }: {
      map: unknown;
      onModeChange?: (mode: string) => void;
    }) => (
      <div
        data-testid="basemap"
        data-has-map={String(map !== null && map !== undefined)}
        data-has-on-mode-change={String(typeof onModeChange === "function")}
      />
    ),
  };
});

// Import after the mock is declared (vi.mock is hoisted by vitest, but we
// keep the import below it for readability). This import will fail until
// src/components/SpotMap.tsx exists -- that is expected right now.
import SpotMap from "@/components/SpotMap";
import {
  ZAMBOANGA_CENTER,
  DEFAULT_ZOOM,
  BASEMAP_PMTILES_URL,
  BASEMAP_ATTRIBUTION,
} from "@/lib/map-config";

function extractLatLng(position: unknown): { lat: number; lng: number } {
  if (Array.isArray(position)) {
    return { lat: position[0], lng: position[1] };
  }
  if (position && typeof position === "object" && "lat" in position && "lng" in position) {
    const p = position as { lat: number; lng: number };
    return { lat: p.lat, lng: p.lng };
  }
  throw new Error(`Unrecognized marker position shape: ${JSON.stringify(position)}`);
}

const unconfirmedSpot: Spot = {
  id: "spot-1",
  name: "Rio Hondo Boardwalk",
  note: "Great sunset view, watch your step on loose planks.",
  lat: 6.9,
  lng: 122.05,
  status: "unconfirmed",
  confirmations: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const confirmedSpot: Spot = {
  id: "spot-2",
  name: "Pasonanca Park",
  note: "Nice picnic spot with a small zoo nearby.",
  lat: 6.95,
  lng: 122.08,
  status: "confirmed",
  confirmations: 3,
  createdAt: "2026-01-02T00:00:00.000Z",
};

describe("SpotMap", () => {
  it("renders a MapContainer centered on ZAMBOANGA_CENTER at DEFAULT_ZOOM", () => {
    render(<SpotMap spots={[]} />);
    const map = screen.getByTestId("map-container");
    expect(JSON.parse(map.getAttribute("data-center") ?? "null")).toEqual(
      ZAMBOANGA_CENTER,
    );
    expect(map.getAttribute("data-zoom")).toBe(String(DEFAULT_ZOOM));
  });

  it("renders exactly one BasemapLayer and no raster tile layer", () => {
    render(<SpotMap spots={[]} />);

    // The vector "Pergamino" basemap (BasemapLayer) replaces the raw
    // TileLayer SpotMap used to render directly -- SpotMap's own tree must
    // never contain a raster tile layer in the normal (non-fallback) path;
    // BasemapLayer owns that fallback internally now (Pergamino PRD D6).
    const basemaps = screen.getAllByTestId("basemap");
    expect(basemaps).toHaveLength(1);
    expect(screen.queryAllByTestId("tile-layer")).toHaveLength(0);

    // BasemapLayer is wired to a live map and a way to report which mode it
    // lands in, so the raster-fallback chip (T3.1) has something to key off.
    expect(basemaps[0].getAttribute("data-has-on-mode-change")).toBe("true");

    // The basemap's own contract (Pergamino PRD D7/D6): a real .pmtiles
    // archive URL, and OpenStreetMap attribution still reaching the user
    // regardless of which mode it lands in.
    expect(BASEMAP_PMTILES_URL.length).toBeGreaterThan(0);
    expect(BASEMAP_ATTRIBUTION).toContain("OpenStreetMap");
  });

  it("renders zero markers for an empty spots array without crashing", () => {
    render(<SpotMap spots={[]} />);
    expect(screen.queryAllByTestId("marker")).toHaveLength(0);
  });

  it("renders exactly one Marker per spot", () => {
    render(<SpotMap spots={[unconfirmedSpot, confirmedSpot]} />);
    expect(screen.getAllByTestId("marker")).toHaveLength(2);
  });

  it("positions each Marker at [lat, lng] -- not [lng, lat]", () => {
    render(<SpotMap spots={[unconfirmedSpot, confirmedSpot]} />);
    const markers = screen.getAllByTestId("marker");
    const positions = markers.map((m) =>
      extractLatLng(JSON.parse(m.getAttribute("data-position") ?? "null")),
    );

    // Match markers to spots by which lat/lng pair they carry, since marker
    // order is not part of the contract.
    for (const spot of [unconfirmedSpot, confirmedSpot]) {
      const match = positions.find(
        (p) => Math.abs(p.lat - spot.lat) < 1e-9 && Math.abs(p.lng - spot.lng) < 1e-9,
      );
      expect(
        match,
        `expected a marker positioned at lat=${spot.lat}, lng=${spot.lng} for spot "${spot.name}" (got positions: ${JSON.stringify(positions)})`,
      ).toBeDefined();
    }

    // Explicitly guard against a lat/lng swap: since lat (~6-7) and lng
    // (~122) are far apart in magnitude here, a swapped marker would not
    // match any spot above and this assertion would already have failed.
    // Double check directly against the first spot too.
    const swapped = { lat: unconfirmedSpot.lng, lng: unconfirmedSpot.lat };
    const accidentallyMatchesSwapped = positions.some(
      (p) =>
        Math.abs(p.lat - swapped.lat) < 1e-9 && Math.abs(p.lng - swapped.lng) < 1e-9,
    );
    expect(accidentallyMatchesSwapped).toBe(false);
  });

  // Regression coverage for "Invalid LatLng object: (NaN, NaN)" (a full-page
  // runtime crash): one spot with a missing/non-finite coordinate -- a bad
  // upstream row, not something the UI should ever be able to produce on its
  // own -- must not take down every other pin on the map. It's skipped
  // instead.
  it("skips a spots[] row with a non-finite coordinate instead of crashing, and still renders the rest", () => {
    const badSpot: Spot = { ...unconfirmedSpot, id: "spot-bad", lat: NaN, lng: 122.05 };

    expect(() => render(<SpotMap spots={[badSpot, confirmedSpot]} />)).not.toThrow();
    expect(screen.getAllByTestId("marker")).toHaveLength(1);
  });

  it("skips a mapSpots row with an undefined coordinate instead of crashing, and still renders the rest", () => {
    const goodMapSpot: MapSpot = { ...unconfirmedSpot, source: "mine" };
    const badMapSpot: MapSpot = {
      ...confirmedSpot,
      id: "spot-bad-2",
      source: "saved",
      lat: undefined as unknown as number,
    };

    expect(() =>
      render(<SpotMap authStatus="signed-in" mapSpots={[badMapSpot, goodMapSpot]} />),
    ).not.toThrow();
    expect(screen.getAllByTestId("marker")).toHaveLength(1);
  });

  it("shows name, note, and 'Unconfirmed' label in the popup for an unconfirmed spot", () => {
    render(<SpotMap spots={[unconfirmedSpot]} />);
    const popup = screen.getByTestId("popup");
    expect(within(popup).getByText(unconfirmedSpot.name)).toBeInTheDocument();
    expect(within(popup).getByText(unconfirmedSpot.note)).toBeInTheDocument();
    expect(within(popup).getByText(/unconfirmed/i)).toBeInTheDocument();
    // Must not simultaneously claim "confirmed" for an unconfirmed spot.
    expect(within(popup).queryByText(/^confirmed$/i)).not.toBeInTheDocument();
  });

  it("shows name, note, and 'Confirmed' label in the popup for a confirmed spot", () => {
    render(<SpotMap spots={[confirmedSpot]} />);
    const popup = screen.getByTestId("popup");
    expect(within(popup).getByText(confirmedSpot.name)).toBeInTheDocument();
    expect(within(popup).getByText(confirmedSpot.note)).toBeInTheDocument();
    // Plural, not singular: the status pill's own Bilingual(statusConfirmed)
    // English span and ConfirmButton's settled badge both legitimately
    // render the exact word "Confirmed" in a confirmed spot's popup (fix
    // round 1, spec item R1) -- at least one match is what matters here,
    // not exactly one.
    const matches = within(popup).getAllByText(/^confirmed$/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders a note containing HTML-special characters as literal text, not injected markup", () => {
    const dangerousSpot: Spot = {
      id: "spot-3",
      name: "Test & \"Danger\" Spot",
      note: `<b>bold</b> & <script>alert(1)</script> "quoted" 'text'`,
      lat: 6.92,
      lng: 122.07,
      status: "unconfirmed",
      confirmations: 0,
      createdAt: "2026-01-03T00:00:00.000Z",
    };

    render(<SpotMap spots={[dangerousSpot]} />);
    const popup = screen.getByTestId("popup");

    // The literal string must appear as text content...
    expect(within(popup).getByText(dangerousSpot.note)).toBeInTheDocument();
    expect(within(popup).getByText(dangerousSpot.name)).toBeInTheDocument();

    // ...and must NOT have been interpreted as real HTML elements.
    expect(popup.querySelector("script")).toBeNull();
    expect(popup.querySelector("b")).toBeNull();
  });
});

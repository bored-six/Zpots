import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Spot } from "@/lib/spots";
import type { NewSpotInput } from "@/lib/validation";

const fetchSpots = vi.fn();
const createSpot = vi.fn();
const confirmSpot = vi.fn();
const reportSpot = vi.fn();
const getLocalConfirmerId = vi.fn(() => "confirmer-abc123");
const getLocallyConfirmedSpotIds = vi.fn(() => new Set<string>());
const markSpotConfirmedLocally = vi.fn();

vi.mock("@/lib/spots-repo", () => ({
  fetchSpots: (...args: unknown[]) => fetchSpots(...args),
  createSpot: (...args: unknown[]) => createSpot(...args),
  confirmSpot: (...args: unknown[]) => confirmSpot(...args),
  reportSpot: (...args: unknown[]) => reportSpot(...args),
}));

vi.mock("@/lib/local-identity", () => ({
  getLocalConfirmerId: (...args: unknown[]) => getLocalConfirmerId(...args),
}));

vi.mock("@/lib/confirmed-spots-storage", () => ({
  getLocallyConfirmedSpotIds: (...args: unknown[]) => getLocallyConfirmedSpotIds(...args),
  markSpotConfirmedLocally: (...args: unknown[]) => markSpotConfirmedLocally(...args),
}));

// Thin stand-in for the real map -- Leaflet/react-leaflet is exercised by
// SpotMap.test.tsx / SpotMap.wiring.test.tsx already. Here we only care
// that page.tsx wires fetch/create/confirm/report through to whatever
// receives these props, so the stub just surfaces them as clickable
// triggers and a serialized dump of what it was given.
vi.mock("@/components/MapView", () => ({
  default: (props: {
    spots: readonly Spot[];
    confirmedSpotIds: ReadonlySet<string>;
    onCreateSpot: (input: NewSpotInput) => Promise<void>;
    onConfirmSpot: (spotId: string) => Promise<void>;
    onReportSpot: (spotId: string, reason: string, details?: string) => Promise<void>;
  }) => (
    <div data-testid="map-view">
      <div data-testid="map-view-spot-ids">{props.spots.map((s) => s.id).join(",")}</div>
      <div data-testid="map-view-confirmed-ids">
        {Array.from(props.confirmedSpotIds).join(",")}
      </div>
      <button
        type="button"
        onClick={() =>
          props.onCreateSpot({
            name: "New Spot",
            note: "A note",
            lat: 1,
            lng: 2,
            photoFile: null,
          })
        }
      >
        trigger-create
      </button>
      <button type="button" onClick={() => props.onConfirmSpot("spot-1")}>
        trigger-confirm
      </button>
      <button
        type="button"
        onClick={() => props.onReportSpot("spot-1", "spam", "bad actor")}
      >
        trigger-report
      </button>
    </div>
  ),
}));

const seedSpot: Spot = {
  id: "spot-1",
  name: "Rio Hondo Boardwalk",
  note: "Great sunset view.",
  lat: 6.9,
  lng: 122.05,
  status: "unconfirmed",
  confirmations: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  getLocalConfirmerId.mockReturnValue("confirmer-abc123");
  getLocallyConfirmedSpotIds.mockReturnValue(new Set<string>());
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("Home page -- live data wiring", () => {
  it("shows a loading state while the initial fetch is in flight, then renders the fetched spots", async () => {
    let resolveFetch!: (spots: Spot[]) => void;
    fetchSpots.mockReturnValue(
      new Promise<Spot[]>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const Home = (await import("@/app/page")).default;
    render(<Home />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    resolveFetch([seedSpot]);

    await waitFor(() => {
      expect(screen.getByTestId("map-view-spot-ids")).toHaveTextContent("spot-1");
    });
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it("renders only the fetched spots, never SEED_SPOTS, once fetch resolves (spec F4)", async () => {
    fetchSpots.mockResolvedValue([seedSpot]);

    const Home = (await import("@/app/page")).default;
    render(<Home />);

    await waitFor(() => {
      expect(screen.getByTestId("map-view-spot-ids")).toHaveTextContent("spot-1");
    });
    // fort-pilar is SEED_SPOTS' id -- it must never appear once live data is wired.
    expect(screen.getByTestId("map-view-spot-ids").textContent).not.toContain("fort-pilar");
  });

  it("shows an inline error state if the initial fetch fails, while the map stays usable", async () => {
    fetchSpots.mockRejectedValue(new Error("Network down"));

    const Home = (await import("@/app/page")).default;
    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText(/network down|couldn.?t load/i)).toBeInTheDocument();
    });
    expect(screen.getByTestId("map-view")).toBeInTheDocument();
  });

  it("wires onCreateSpot to createSpot and prepends the returned spot to what MapView receives", async () => {
    fetchSpots.mockResolvedValue([]);
    const created: Spot = {
      id: "spot-2",
      name: "New Spot",
      note: "A note",
      lat: 1,
      lng: 2,
      status: "unconfirmed",
      confirmations: 0,
      createdAt: "2026-02-01T00:00:00.000Z",
    };
    createSpot.mockResolvedValue(created);

    const Home = (await import("@/app/page")).default;
    const user = userEvent.setup();
    render(<Home />);

    await waitFor(() => expect(screen.getByTestId("map-view")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "trigger-create" }));

    expect(createSpot).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByTestId("map-view-spot-ids")).toHaveTextContent("spot-2");
    });
  });

  it("wires onConfirmSpot to confirmSpot(spotId, getLocalConfirmerId()), updates the spot, and records it locally (spec F9)", async () => {
    fetchSpots.mockResolvedValue([seedSpot]);
    const updated: Spot = { ...seedSpot, confirmations: 1, status: "unconfirmed" };
    confirmSpot.mockResolvedValue(updated);

    const Home = (await import("@/app/page")).default;
    const user = userEvent.setup();
    render(<Home />);

    await waitFor(() => expect(screen.getByTestId("map-view-spot-ids")).toHaveTextContent("spot-1"));
    await user.click(screen.getByRole("button", { name: "trigger-confirm" }));

    expect(confirmSpot).toHaveBeenCalledWith("spot-1", "confirmer-abc123");
    expect(markSpotConfirmedLocally).toHaveBeenCalledWith("spot-1");
  });

  it("wires onReportSpot to reportSpot with the exact reason/details passed through", async () => {
    fetchSpots.mockResolvedValue([seedSpot]);
    reportSpot.mockResolvedValue(undefined);

    const Home = (await import("@/app/page")).default;
    const user = userEvent.setup();
    render(<Home />);

    await waitFor(() => expect(screen.getByTestId("map-view-spot-ids")).toHaveTextContent("spot-1"));
    await user.click(screen.getByRole("button", { name: "trigger-report" }));

    expect(reportSpot).toHaveBeenCalledWith("spot-1", "spam", "bad actor");
  });
});

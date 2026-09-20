import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, AuthUser } from "@/lib/auth";
import type { MapSpot } from "@/lib/spots";
import { COPY } from "@/lib/copy";

const myMap = vi.fn();
const unsaveSpot = vi.fn();
const useAuthMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/saves-repo", () => ({
  myMap: (...args: unknown[]) => myMap(...args),
  unsaveSpot: (...args: unknown[]) => unsaveSpot(...args),
}));

// The read-only personal map -- bounds/tint/popup skeleton unchanged from
// the write-mode SpotMap, but this test only cares what mapa/page.tsx feeds
// it: the filtered spot list, the deep-link target, and the unsave handler.
vi.mock("@/components/SpotMap", () => ({
  default: (props: { mapSpots: MapSpot[]; openSpotId?: string; onUnsave: (spotId: string) => void }) => (
    <div data-testid="spot-map">
      <div data-testid="spot-map-ids">{props.mapSpots.map((s) => `${s.id}:${s.source}`).join(",")}</div>
      <div data-testid="spot-map-open-id">{props.openSpotId ?? ""}</div>
      {props.mapSpots.map((s) => (
        <button key={s.id} onClick={() => props.onUnsave(s.id)}>{`quita-${s.id}`}</button>
      ))}
    </div>
  ),
}));

function authValue(status: AuthStatus, user: AuthUser | null = null) {
  return { status, user, signOut: vi.fn() };
}

function makeMapSpot(overrides: Partial<MapSpot> = {}): MapSpot {
  return {
    id: "spot-1",
    name: "Fort Pilar",
    note: "Historic fort.",
    lat: 6.9098,
    lng: 122.079,
    status: "unconfirmed",
    confirmations: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    author: { id: "user-2", handle: "kuya_ben", displayName: "Kuya Ben", avatarUrl: null },
    source: "mine",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  useAuthMock.mockReturnValue(authValue("signed-out"));
  myMap.mockResolvedValue([]);
});

afterEach(() => {
  vi.resetAllMocks();
});

async function renderMapaPage() {
  const MapaPage = (await import("@/app/mapa/page")).default;
  return render(<MapaPage />);
}

describe("Mi mapa -- signed out", () => {
  it("shows the sign-in gate and never calls myMap()", async () => {
    await renderMapaPage();

    expect(await screen.findByText(new RegExp(COPY.emptyMap.en, "i"))).toBeInTheDocument();
    expect(myMap).not.toHaveBeenCalled();
    expect(screen.queryByTestId("spot-map")).not.toBeInTheDocument();
  });
});

describe("Mi mapa -- signed in", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue(authValue("signed-in", { id: "user-1", email: "a@b.com", nickname: "" }));
  });

  it("calls myMap() and renders the returned pins with their source", async () => {
    myMap.mockResolvedValue([makeMapSpot({ id: "spot-1", source: "mine" }), makeMapSpot({ id: "spot-2", source: "been" })]);

    await renderMapaPage();

    await waitFor(() => expect(myMap).toHaveBeenCalled());
    expect(await screen.findByTestId("spot-map-ids")).toHaveTextContent("spot-1:mine,spot-2:been");
  });

  it("shows the empty-map copy when myMap() resolves no pins", async () => {
    myMap.mockResolvedValue([]);

    await renderMapaPage();

    expect(await screen.findByText(new RegExp(COPY.emptyMap.en, "i"))).toBeInTheDocument();
  });

  it("legend: unchecking 'Guardao' hides saved-source pins from the map", async () => {
    myMap.mockResolvedValue([
      makeMapSpot({ id: "spot-1", source: "mine" }),
      makeMapSpot({ id: "spot-2", source: "saved" }),
    ]);
    const user = userEvent.setup();
    await renderMapaPage();
    await screen.findByTestId("spot-map-ids");

    const savedToggle = screen.getByRole("checkbox", { name: new RegExp(COPY.saved.en, "i") });
    await user.click(savedToggle);

    await waitFor(() => expect(screen.getByTestId("spot-map-ids")).toHaveTextContent("spot-1:mine"));
    expect(screen.getByTestId("spot-map-ids")).not.toHaveTextContent("spot-2");
  });

  it("Quita on a saved pin calls unsaveSpot and removes it from the map", async () => {
    myMap.mockResolvedValue([makeMapSpot({ id: "spot-2", source: "saved" })]);
    unsaveSpot.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderMapaPage();
    await screen.findByText("quita-spot-2");

    await user.click(screen.getByText("quita-spot-2"));

    expect(unsaveSpot).toHaveBeenCalledWith("spot-2");
    await waitFor(() => expect(screen.getByTestId("spot-map-ids")).not.toHaveTextContent("spot-2"));
  });

  it("passes ?spot=<id> through as the pin to open", async () => {
    searchParams = new URLSearchParams({ spot: "spot-2" });
    myMap.mockResolvedValue([makeMapSpot({ id: "spot-2", source: "been" })]);

    await renderMapaPage();

    await waitFor(() => expect(screen.getByTestId("spot-map-open-id")).toHaveTextContent("spot-2"));
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, AuthUser } from "@/lib/auth";
import type { SpotCard } from "@/lib/spots";
import { COPY } from "@/lib/copy";
import { PREVIEW_SPOTS } from "@/lib/preview-spots";

const feedCerca = vi.fn();
const feedNuevo = vi.fn();
const feedSiguiendo = vi.fn();
const hoyRow = vi.fn();
const saveSpot = vi.fn();
const unsaveSpot = vi.fn();
const mySavedIds = vi.fn();
const confirmSpot = vi.fn();
const reportSpot = vi.fn();
const fetchMyConfirmedSpotIds = vi.fn();
const useAuthMock = vi.fn();
const useLocationMock = vi.fn();

let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/use-location", () => ({
  useLocation: () => useLocationMock(),
}));

vi.mock("@/lib/feed-repo", () => ({
  feedCerca: (...args: unknown[]) => feedCerca(...args),
  feedNuevo: (...args: unknown[]) => feedNuevo(...args),
  feedSiguiendo: (...args: unknown[]) => feedSiguiendo(...args),
  hoyRow: (...args: unknown[]) => hoyRow(...args),
}));

vi.mock("@/lib/saves-repo", () => ({
  saveSpot: (...args: unknown[]) => saveSpot(...args),
  unsaveSpot: (...args: unknown[]) => unsaveSpot(...args),
  mySavedIds: (...args: unknown[]) => mySavedIds(...args),
}));

vi.mock("@/lib/spots-repo", () => ({
  confirmSpot: (...args: unknown[]) => confirmSpot(...args),
  reportSpot: (...args: unknown[]) => reportSpot(...args),
  fetchMyConfirmedSpotIds: (...args: unknown[]) => fetchMyConfirmedSpotIds(...args),
}));

vi.mock("@/components/SpotCardView", () => ({
  default: (props: { card: SpotCard; onSave: () => void; onBeenHere: () => void }) => (
    <div data-testid="spot-card" data-spot-id={props.card.id} data-distance={String(props.card.distanceM ?? "")}>
      <button onClick={props.onSave}>{`save-${props.card.id}`}</button>
      <button onClick={props.onBeenHere}>{`been-${props.card.id}`}</button>
    </div>
  ),
}));

vi.mock("@/components/HoyRow", () => ({
  default: () => <div data-testid="hoy-row" />,
}));

import SpotsDeck from "@/components/SpotsDeck";

function authValue(status: AuthStatus, user: AuthUser | null = null) {
  return { status, user, signOut: vi.fn() };
}

function makeCards(count: number): SpotCard[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `spot-${i}`,
    name: `Spot ${i}`,
    note: "A note.",
    lat: 6.9 + i * 0.001,
    lng: 122.05,
    status: "unconfirmed" as const,
    confirmations: 0,
    createdAt: new Date(2026, 0, i + 1).toISOString(),
    author: { id: "user-2", handle: "kuya_ben", displayName: "Kuya Ben", avatarUrl: null },
  }));
}

function renderedIds() {
  return screen.getAllByTestId("spot-card").map((el) => el.getAttribute("data-spot-id"));
}

const ORIGIN = { lat: 6.9106, lng: 122.0736 };

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  useAuthMock.mockReturnValue(authValue("signed-out"));
  useLocationMock.mockReturnValue({ status: "granted", coords: ORIGIN, isFallback: false });
  feedCerca.mockResolvedValue([]);
  feedNuevo.mockResolvedValue([]);
  feedSiguiendo.mockResolvedValue([]);
  hoyRow.mockResolvedValue([]);
  mySavedIds.mockResolvedValue(new Set<string>());
  fetchMyConfirmedSpotIds.mockResolvedValue(new Set<string>());
});

afterEach(() => {
  vi.resetAllMocks();
});

/**
 * Preview fallback: when a lane that anyone can browse (Cerca, Nuevo)
 * comes back empty, the deck shows the famous-places preview instead of
 * the "No spots yet" arch, so a brand-new install still has something to
 * swipe. Siguiendo stays honest (it is empty because you follow nobody),
 * and a failed load stays an error -- previews never mask a broken feed.
 */
describe("SpotsDeck -- preview fallback", () => {
  it("Cerca empty: renders the preview cards, in order, and no 'No spots yet'", async () => {
    render(<SpotsDeck />);

    await waitFor(() => expect(screen.getAllByTestId("spot-card").length).toBeGreaterThan(0));
    const ids = renderedIds();
    expect(ids.every((id) => id?.startsWith("preview-"))).toBe(true);
    expect(ids[0]).toBe(PREVIEW_SPOTS[0].id);
    expect(screen.queryByText(new RegExp(COPY.noSpotsYet.en, "i"))).not.toBeInTheDocument();
  });

  it("Cerca empty: preview cards carry a distance from the resolved location", async () => {
    render(<SpotsDeck />);

    await waitFor(() => expect(screen.getAllByTestId("spot-card").length).toBeGreaterThan(0));
    const first = screen.getAllByTestId("spot-card")[0];
    expect(Number(first.getAttribute("data-distance"))).toBeGreaterThan(0);
  });

  it("Cerca empty: shows the preview hint strip", async () => {
    render(<SpotsDeck />);

    expect(await screen.findByText(new RegExp(COPY.previewHint.en, "i"))).toBeInTheDocument();
  });

  it("Cerca empty: does not keep paging -- feedCerca is called exactly once", async () => {
    render(<SpotsDeck />);

    await waitFor(() => expect(screen.getAllByTestId("spot-card").length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(feedCerca).toHaveBeenCalledTimes(1);
  });

  it("Nuevo empty: renders the preview cards too", async () => {
    const user = userEvent.setup();
    render(<SpotsDeck />);
    await user.click(await screen.findByRole("button", { name: new RegExp(COPY.nuevo.en, "i") }));

    await waitFor(() => expect(screen.getAllByTestId("spot-card").length).toBeGreaterThan(0));
    expect(renderedIds().every((id) => id?.startsWith("preview-"))).toBe(true);
  });

  it("Cerca with real spots: no preview cards are mixed in", async () => {
    feedCerca.mockResolvedValue(makeCards(3));
    render(<SpotsDeck />);

    await waitFor(() => expect(screen.getAllByTestId("spot-card").length).toBeGreaterThan(0));
    expect(renderedIds().some((id) => id?.startsWith("preview-"))).toBe(false);
    expect(screen.queryByText(new RegExp(COPY.previewHint.en, "i"))).not.toBeInTheDocument();
  });

  it("Cerca failed: still shows 'Could not load' + Retry, never the previews", async () => {
    feedCerca.mockRejectedValue(new Error("boom"));
    render(<SpotsDeck />);

    expect(await screen.findByText(new RegExp(COPY.couldNotLoad.en, "i"))).toBeInTheDocument();
    expect(screen.queryAllByTestId("spot-card")).toHaveLength(0);
  });

  it("Siguiendo signed-in but empty: shows 'No spots yet', never the previews", async () => {
    useAuthMock.mockReturnValue(authValue("signed-in", { id: "user-1", email: "a@b.com", nickname: "" }));
    const user = userEvent.setup();
    render(<SpotsDeck />);
    await user.click(await screen.findByRole("button", { name: new RegExp(COPY.siguiendo.en, "i") }));

    expect(await screen.findByText(new RegExp(COPY.noSpotsYet.en, "i"))).toBeInTheDocument();
    expect(screen.queryAllByTestId("spot-card")).toHaveLength(0);
  });

  it("preview cards never reach the save / confirm RPCs even if a handler fires", async () => {
    useAuthMock.mockReturnValue(authValue("signed-in", { id: "user-1", email: "a@b.com", nickname: "" }));
    const user = userEvent.setup();
    render(<SpotsDeck />);
    const firstId = PREVIEW_SPOTS[0].id;
    await screen.findByText(`save-${firstId}`);

    await user.click(screen.getByText(`save-${firstId}`));
    await user.click(screen.getByText(`been-${firstId}`));

    expect(saveSpot).not.toHaveBeenCalled();
    expect(confirmSpot).not.toHaveBeenCalled();
  });
});

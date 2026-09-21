import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, AuthUser } from "@/lib/auth";
import type { SpotCard } from "@/lib/spots";
import { COPY } from "@/lib/copy";
import { PREVIEW_SPOTS } from "@/lib/preview-spots";

/**
 * Famosos lane (famosos-lane.md PRD, Task 2): a 4th lane showing the
 * curated famous-Zamboanga-spots set, always available with no account and
 * with no pagination (the set is fixed-size). Mirrors the mock harness used
 * throughout the other SpotsDeck test files.
 */

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
    <div data-testid="spot-card" data-spot-id={props.card.id}>
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

function renderedIds() {
  return screen.getAllByTestId("spot-card").map((el) => el.getAttribute("data-spot-id"));
}

async function switchToFamosos(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: new RegExp(COPY.famosos.en, "i") }));
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  useAuthMock.mockReturnValue(authValue("signed-out"));
  useLocationMock.mockReturnValue({
    status: "granted",
    coords: { lat: 6.9106, lng: 122.0736 },
    isFallback: false,
  });
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

describe("SpotsDeck -- Famosos lane", () => {
  it("renders a Famosos tab selectable by its English accessible name", async () => {
    render(<SpotsDeck />);

    expect(
      await screen.findByRole("button", { name: new RegExp(COPY.famosos.en, "i") }),
    ).toBeInTheDocument();
  });

  it("the default lane is still Cerca, not Famosos", async () => {
    render(<SpotsDeck />);

    await waitFor(() => expect(feedCerca).toHaveBeenCalled());
    expect(feedNuevo).not.toHaveBeenCalled();
    expect(feedSiguiendo).not.toHaveBeenCalled();
  });

  it("selecting Famosos shows the curated famous spots, in order, with no account", async () => {
    const user = userEvent.setup();
    render(<SpotsDeck />);
    await waitFor(() => expect(feedCerca).toHaveBeenCalled());

    await switchToFamosos(user);

    await waitFor(() => expect(screen.getAllByTestId("spot-card").length).toBeGreaterThan(0));
    const ids = renderedIds();
    expect(ids.every((id) => id?.startsWith("preview-"))).toBe(true);
    expect(ids[0]).toBe(PREVIEW_SPOTS[0].id);
  });

  it("works fully signed-out: no sign-in gate appears for Famosos", async () => {
    const user = userEvent.setup();
    render(<SpotsDeck />);
    await waitFor(() => expect(feedCerca).toHaveBeenCalled());

    await switchToFamosos(user);

    await waitFor(() => expect(screen.getAllByTestId("spot-card").length).toBeGreaterThan(0));
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
  });

  it("never calls any feed function for Famosos and does not paginate", async () => {
    const user = userEvent.setup();
    render(<SpotsDeck />);
    await waitFor(() => expect(feedCerca).toHaveBeenCalled());
    feedCerca.mockClear();
    feedNuevo.mockClear();
    feedSiguiendo.mockClear();

    await switchToFamosos(user);
    await waitFor(() => expect(screen.getAllByTestId("spot-card").length).toBeGreaterThan(0));

    const deck = screen.getByTestId("spots-deck");
    deck.focus();
    // Walk the whole fixed-size set forward past its end -- if pagination
    // ever fired, one of the feed mocks would have recorded a call.
    for (let i = 0; i < PREVIEW_SPOTS.length + 5; i++) {
      await userEvent.keyboard("{ArrowDown}");
    }
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(feedCerca).not.toHaveBeenCalled();
    expect(feedNuevo).not.toHaveBeenCalled();
    expect(feedSiguiendo).not.toHaveBeenCalled();
  });

  it("does not show the 'preview' fallback hint strip -- Famosos is its own real lane, not a masked empty one", async () => {
    const user = userEvent.setup();
    render(<SpotsDeck />);
    await waitFor(() => expect(feedCerca).toHaveBeenCalled());

    await switchToFamosos(user);

    await waitFor(() => expect(screen.getAllByTestId("spot-card").length).toBeGreaterThan(0));
    expect(screen.queryByText(new RegExp(COPY.previewHint.en, "i"))).not.toBeInTheDocument();
  });

  it("switching Famosos -> Cerca and back behaves: Cerca re-fetches, Famosos re-shows the preview set", async () => {
    feedCerca.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<SpotsDeck />);
    await waitFor(() => expect(feedCerca).toHaveBeenCalledTimes(1));

    await switchToFamosos(user);
    await waitFor(() => expect(screen.getAllByTestId("spot-card").length).toBeGreaterThan(0));

    await user.click(screen.getByRole("button", { name: new RegExp(COPY.cerca.en, "i") }));
    await waitFor(() => expect(feedCerca).toHaveBeenCalledTimes(2));

    await switchToFamosos(user);
    await waitFor(() => expect(screen.getAllByTestId("spot-card").length).toBeGreaterThan(0));
    expect(renderedIds().every((id) => id?.startsWith("preview-"))).toBe(true);
  });

  it("preview cards in the Famosos lane never reach the save / confirm RPCs", async () => {
    const user = userEvent.setup();
    render(<SpotsDeck />);
    await waitFor(() => expect(feedCerca).toHaveBeenCalled());
    await switchToFamosos(user);
    const firstId = PREVIEW_SPOTS[0].id;
    await screen.findByText(`save-${firstId}`);

    await user.click(screen.getByText(`save-${firstId}`));
    await user.click(screen.getByText(`been-${firstId}`));

    expect(saveSpot).not.toHaveBeenCalled();
    expect(confirmSpot).not.toHaveBeenCalled();
  });

  it("does not call feedSiguiendo/feedNuevo when switching to Famosos right after Cerca loaded a full page (hasMore=true) near the end, and actually shows the Famosos cards, not stale Cerca ones", async () => {
    // PAGE_SIZE in SpotsDeck.tsx is 10 and isn't exported -- mirrored here.
    const PAGE_SIZE = 10;
    const cercaPage: SpotCard[] = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      id: `cerca-${i}`,
      name: `Cerca Spot ${i}`,
      note: "A note.",
      lat: 6.9 + i * 0.001,
      lng: 122.05,
      status: "unconfirmed" as const,
      confirmations: 0,
      createdAt: new Date(2026, 0, i + 1).toISOString(),
      author: { id: "user-2", handle: "kuya_ben", displayName: "Kuya Ben", avatarUrl: null },
    }));
    // Every call resolves the same full page -- deliberate: the point is to
    // reach and click Famosos *before* Cerca's own next-page prefetch (also
    // legitimately triggered by walking this close to the end) has settled,
    // so `hasMore` is still true and `cards` is still Cerca's 10 at the
    // exact moment of the switch. Waiting for that own-lane prefetch to
    // resolve first would grow `cards` well past
    // `activeIndex + PREFETCH_THRESHOLD` and mask the race this test
    // targets -- it would pass even on the unfixed component for the wrong
    // reason.
    feedCerca.mockResolvedValue(cercaPage);
    const user = userEvent.setup();
    render(<SpotsDeck />);
    // Only the +/-2 window around activeIndex (0) mounts at first -- wait
    // for the load rather than the full page count.
    await waitFor(() => expect(feedCerca).toHaveBeenCalledTimes(1));
    await screen.findAllByTestId("spot-card");

    // Walk near the end of the full Cerca page -- inside PREFETCH_THRESHOLD
    // (3) of the last card -- exactly the window famosos-lane.md's
    // Task-3 fix targets: a lane switch from here must not read `hasMore`
    // (still true, carried over from Cerca) or `cards` (still Cerca's)
    // before Famosos's own load has replaced them.
    const deck = screen.getByTestId("spots-deck");
    deck.focus();
    for (let i = 0; i < 7; i++) {
      await user.keyboard("{ArrowDown}");
    }

    feedNuevo.mockClear();
    feedSiguiendo.mockClear();

    await switchToFamosos(user);

    await waitFor(() => {
      const ids = renderedIds();
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.every((id) => id?.startsWith("preview-"))).toBe(true);
    });
    // Give any in-flight Cerca prefetch (started before the switch, from
    // walking near the end above) a chance to resolve and, if the fix
    // regressed, clobber the cards back to stale Cerca ones.
    await new Promise((resolve) => setTimeout(resolve, 30));
    // Not just "no spurious call" -- the reviewed failure mode was a late
    // resolution clobbering the correct Famosos cards back to Cerca's, with
    // the tab still reporting selected. Guard the actual rendered content.
    expect(renderedIds().some((id) => id?.startsWith("cerca-"))).toBe(false);
    expect(renderedIds().every((id) => id?.startsWith("preview-"))).toBe(true);
    expect(feedSiguiendo).not.toHaveBeenCalled();
    expect(feedNuevo).not.toHaveBeenCalled();
  });

  it("the lane tab strip can hold four pills without wrapping at phone width (horizontal scroll, not wrap)", async () => {
    render(<SpotsDeck />);
    await screen.findByRole("button", { name: new RegExp(COPY.famosos.en, "i") });

    const strip = screen.getByTestId("lane-tabs");
    expect(strip.className).toContain("overflow-x-auto");
    expect(strip.className).not.toContain("flex-wrap");
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, AuthUser } from "@/lib/auth";
import type { SpotCard } from "@/lib/spots";

/**
 * Adversarial pass on SpotsDeck's paging/save logic (mirrors the mock
 * harness in SpotsDeck.test.tsx exactly -- kept in its own file per the
 * `*.adversarial.test.ts(x)` convention used elsewhere in this suite).
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
const routerReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ replace: routerReplace }),
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
  default: (props: {
    card: SpotCard;
    isSaved: boolean;
    confirmedByMe: boolean;
    onSave: () => void;
    onUnsave: () => void;
    onBeenHere: () => void;
    onReport: (reason: string, details?: string) => void;
  }) => (
    <div data-testid="spot-card" data-spot-id={props.card.id} data-is-saved={String(props.isSaved)}>
      <button onClick={props.onSave}>{`save-${props.card.id}`}</button>
      <button onClick={props.onUnsave}>{`unsave-${props.card.id}`}</button>
      <button onClick={props.onBeenHere}>{`been-${props.card.id}`}</button>
    </div>
  ),
}));

vi.mock("@/components/HoyRow", () => ({
  default: (props: { entries: { spotId: string }[]; onSelect: (spotId: string) => void }) => (
    <div data-testid="hoy-row">
      {props.entries.map((entry) => (
        <button key={entry.spotId} onClick={() => props.onSelect(entry.spotId)}>
          {`hoy-${entry.spotId}`}
        </button>
      ))}
    </div>
  ),
}));

import SpotsDeck from "@/components/SpotsDeck";

function authValue(status: AuthStatus, user: AuthUser | null = null) {
  return { status, user, signOut: vi.fn() };
}

function makeCard(id: string, overrides: Partial<SpotCard> = {}): SpotCard {
  return {
    id,
    name: `Spot ${id}`,
    note: "A note.",
    lat: 6.9,
    lng: 122.05,
    status: "unconfirmed",
    confirmations: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    author: { id: "user-2", handle: "kuya_ben", displayName: "Kuya Ben", avatarUrl: null },
    ...overrides,
  };
}

function makeCards(count: number, prefix = "spot"): SpotCard[] {
  return Array.from({ length: count }, (_, i) =>
    makeCard(`${prefix}-${i}`, { createdAt: new Date(2026, 0, i + 1).toISOString() }),
  );
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

describe("adversarial", () => {
  describe("paging boundaries", () => {
    it("a page with exactly PAGE_SIZE (10) items followed by an empty page stops fetching (hasMore flips off)", async () => {
      feedCerca.mockResolvedValueOnce(makeCards(10));
      feedCerca.mockResolvedValueOnce([]);
      feedCerca.mockResolvedValue([]);
      render(<SpotsDeck />);
      await screen.findAllByTestId("spot-card");

      const deck = screen.getByTestId("spots-deck");
      deck.focus();
      for (let i = 0; i < 9; i++) {
        await userEvent.keyboard("{ArrowDown}");
      }

      await waitFor(() => expect(feedCerca).toHaveBeenCalledTimes(2));

      // hasMore should now be false -- pressing ArrowDown at the last card
      // must not trigger a third fetch.
      await userEvent.keyboard("{ArrowDown}");
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(feedCerca).toHaveBeenCalledTimes(2);
    });

    // Preview round: an empty Cerca now renders the famous-places preview
    // cards instead of the empty-lane arch (SpotsDeck.preview.test.tsx
    // covers that); the arch is only reachable from a signed-in, empty
    // Siguiendo lane, which is what this now exercises.
    it("an empty first page renders the empty-lane state without crashing", async () => {
      useAuthMock.mockReturnValue(authValue("signed-in", { id: "user-1", email: "a@b.com", nickname: "" }));
      feedSiguiendo.mockResolvedValue([]);
      const user = userEvent.setup();
      render(<SpotsDeck />);
      await user.click(await screen.findByRole("button", { name: /following/i }));

      expect(await screen.findByText(/no spots yet/i)).toBeInTheDocument();
      expect(screen.queryByTestId("spot-card")).not.toBeInTheDocument();
    });

    it("BUG: an overlapping second page (a routine offset-pagination hazard -- feedCerca pages by plain page_offset, so a spot created between two fetches shifts every later row by one) renders the same spot id twice in the DOM at once", async () => {
      const page1 = makeCards(10); // spot-0 .. spot-9
      const page2 = [
        makeCard("spot-9", { name: "Spot 9 (duplicate copy from the shifted page)" }),
        ...Array.from({ length: 6 }, (_, i) => makeCard(`spot-1${i}`)),
      ];
      feedCerca.mockResolvedValueOnce(page1);
      feedCerca.mockResolvedValueOnce(page2);
      feedCerca.mockResolvedValue([]);

      render(<SpotsDeck />);
      await screen.findAllByTestId("spot-card");

      const deck = screen.getByTestId("spots-deck");
      deck.focus();
      for (let i = 0; i < 9; i++) {
        await userEvent.keyboard("{ArrowDown}");
      }

      await waitFor(() => expect(feedCerca).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(screen.getByTestId("spots-deck").getAttribute("data-active-id")).toBe("spot-9"),
      );

      // SpotsDeck's `cards` state is never de-duplicated by id (the prefetch
      // effect just does `setCards((prev) => [...prev, ...next])`), so the
      // window around index 9 now contains both the original spot-9 (index
      // 9) and its duplicate (index 10) at the same time.
      const idsInWindow = screen
        .getAllByTestId("spot-card")
        .map((el) => el.getAttribute("data-spot-id"));
      const spot9Count = idsInWindow.filter((id) => id === "spot-9").length;

      expect(spot9Count).toBe(1);
    });
  });

  describe("?spot= deep link for an id not on the first page", () => {
    it("BUG: never resolves and silently stays on the first card -- the deck only re-checks the deep link when a prefetch happens to fire, and prefetching only triggers once the active card is near the end of what's loaded, which never happens while the active index sits at 0", async () => {
      searchParams = new URLSearchParams({ spot: "spot-99" });
      feedCerca.mockResolvedValueOnce(makeCards(10)); // spot-0..spot-9, no spot-99
      feedCerca.mockResolvedValue([]);

      render(<SpotsDeck />);
      await screen.findAllByTestId("spot-card");

      // Give any pending microtasks a chance to settle.
      await new Promise((resolve) => setTimeout(resolve, 20));

      // A second page was never even requested -- the deep-linked spot can
      // never be found, and there is no error or "not found" affordance for
      // the user either.
      expect(feedCerca).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("spots-deck").getAttribute("data-active-id")).toBe("spot-0");
    });
  });

  describe("save/unsave rapid double-tap", () => {
    it("double-tapping Save calls saveSpot each time and ends saved (idempotent, no crash)", async () => {
      feedCerca.mockResolvedValue(makeCards(1));
      const resolvers: Array<() => void> = [];
      saveSpot.mockImplementation(() => new Promise<void>((resolve) => resolvers.push(resolve)));
      const user = userEvent.setup();
      render(<SpotsDeck />);
      await screen.findByText("save-spot-0");

      await user.click(screen.getByText("save-spot-0"));
      await user.click(screen.getByText("save-spot-0"));

      expect(saveSpot).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("spot-card").getAttribute("data-is-saved")).toBe("true");
      resolvers.forEach((resolve) => resolve());
    });

    it("save then rapid unsave, where unsave's server call wins first: the final state matches the last user action (unsaved), not whichever promise settles first", async () => {
      feedCerca.mockResolvedValue(makeCards(1));
      let rejectSave!: (error: Error) => void;
      saveSpot.mockReturnValue(new Promise<void>((_, reject) => (rejectSave = reject)));
      unsaveSpot.mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<SpotsDeck />);
      await screen.findByText("save-spot-0");

      await user.click(screen.getByText("save-spot-0")); // optimistic true, saveSpot pending
      await user.click(screen.getByText("unsave-spot-0")); // optimistic false, unsaveSpot resolves

      await waitFor(() =>
        expect(screen.getByTestId("spot-card").getAttribute("data-is-saved")).toBe("false"),
      );

      rejectSave(new Error("network error"));
      await waitFor(() => expect(saveSpot).toHaveBeenCalledTimes(1));

      // The later, successful unsave is what the server actually reflects --
      // the earlier save's late rejection should not flip it back to saved.
      expect(screen.getByTestId("spot-card").getAttribute("data-is-saved")).toBe("false");
    });

    it("BUG: double-tapping Save where the FIRST call fails but a duplicate SECOND call actually succeeds server-side leaves the UI showing unsaved even though the spot is saved", async () => {
      feedCerca.mockResolvedValue(makeCards(1));
      let rejectFirst!: (error: Error) => void;
      let resolveSecond!: () => void;
      saveSpot
        .mockImplementationOnce(() => new Promise<void>((_, reject) => (rejectFirst = reject)))
        .mockImplementationOnce(() => new Promise<void>((resolve) => (resolveSecond = resolve)));
      const user = userEvent.setup();
      render(<SpotsDeck />);
      await screen.findByText("save-spot-0");

      await user.click(screen.getByText("save-spot-0"));
      await user.click(screen.getByText("save-spot-0"));

      resolveSecond();
      await new Promise((resolve) => setTimeout(resolve, 10));
      rejectFirst(new Error("network blip"));
      await waitFor(() => expect(saveSpot).toHaveBeenCalledTimes(2));
      await new Promise((resolve) => setTimeout(resolve, 10));

      // handleSave's catch unconditionally deletes the id from savedIds on
      // any rejection, with no way to know a duplicate concurrent call for
      // the same spot already succeeded -- the card is shown as unsaved
      // while the server actually has it saved.
      expect(screen.getByTestId("spot-card").getAttribute("data-is-saved")).toBe("true");
    });
  });
});

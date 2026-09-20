import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, AuthUser } from "@/lib/auth";
import type { SpotCard } from "@/lib/spots";
import { COPY } from "@/lib/copy";

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

function makeCards(count: number, prefix = "spot"): SpotCard[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
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

function activeIds() {
  return screen.getAllByTestId("spot-card").map((el) => el.getAttribute("data-spot-id"));
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

describe("SpotsDeck -- lanes", () => {
  it("shows the three lane tabs by their English accessible names", async () => {
    render(<SpotsDeck />);

    expect(await screen.findByRole("button", { name: new RegExp(COPY.cerca.en, "i") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: new RegExp(COPY.nuevo.en, "i") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: new RegExp(COPY.siguiendo.en, "i") })).toBeInTheDocument();
  });

  it("loads the Cerca lane (distance-ordered) by default", async () => {
    render(<SpotsDeck />);

    await waitFor(() => expect(feedCerca).toHaveBeenCalled());
  });

  it("switching to Nuevo calls feedNuevo and stops calling feedCerca again", async () => {
    const user = userEvent.setup();
    render(<SpotsDeck />);
    await waitFor(() => expect(feedCerca).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: new RegExp(COPY.nuevo.en, "i") }));

    await waitFor(() => expect(feedNuevo).toHaveBeenCalled());
  });

  it("signed-in: switching to Siguiendo calls feedSiguiendo", async () => {
    useAuthMock.mockReturnValue(authValue("signed-in", { id: "user-1", email: "a@b.com", nickname: "" }));
    const user = userEvent.setup();
    render(<SpotsDeck />);
    await waitFor(() => expect(feedCerca).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: new RegExp(COPY.siguiendo.en, "i") }));

    await waitFor(() => expect(feedSiguiendo).toHaveBeenCalled());
  });

  it("signed-out: switching to Siguiendo shows a sign-in gate instead of calling feedSiguiendo", async () => {
    const user = userEvent.setup();
    render(<SpotsDeck />);
    await waitFor(() => expect(feedCerca).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: new RegExp(COPY.siguiendo.en, "i") }));

    expect(await screen.findByText(/sign in/i)).toBeInTheDocument();
    expect(feedSiguiendo).not.toHaveBeenCalled();
  });

  it("shows the empty-lane copy when a lane has no cards", async () => {
    feedCerca.mockResolvedValue([]);
    render(<SpotsDeck />);

    expect(await screen.findByText(new RegExp(COPY.noSpotsYet.en, "i"))).toBeInTheDocument();
  });
});

describe("SpotsDeck -- Hoy row", () => {
  it("renders the entries hoyRow() resolves", async () => {
    hoyRow.mockResolvedValue([{ spotId: "spot-5", author: { id: "u", handle: "h", displayName: "H", avatarUrl: null } }]);
    render(<SpotsDeck />);

    expect(await screen.findByText("hoy-spot-5")).toBeInTheDocument();
  });

  it("tapping a Hoy entry moves the active card to that spot", async () => {
    feedCerca.mockResolvedValue(makeCards(5));
    hoyRow.mockResolvedValue([{ spotId: "spot-3", author: { id: "u", handle: "h", displayName: "H", avatarUrl: null } }]);
    const user = userEvent.setup();
    render(<SpotsDeck />);
    await screen.findByText("hoy-spot-3");

    await user.click(screen.getByText("hoy-spot-3"));

    await waitFor(() => expect(screen.getByTestId("spots-deck").getAttribute("data-active-id")).toBe("spot-3"));
  });
});

describe("SpotsDeck -- ?spot= deep link", () => {
  it("opens on the requested spot when it's already in the loaded lane", async () => {
    searchParams = new URLSearchParams({ spot: "spot-2" });
    feedCerca.mockResolvedValue(makeCards(5));
    render(<SpotsDeck />);

    await waitFor(() => expect(screen.getByTestId("spots-deck").getAttribute("data-active-id")).toBe("spot-2"));
  });
});

describe("SpotsDeck -- keyboard navigation", () => {
  it("ArrowDown moves the active card forward", async () => {
    feedCerca.mockResolvedValue(makeCards(5));
    render(<SpotsDeck />);
    await screen.findAllByTestId("spot-card");
    expect(screen.getByTestId("spots-deck").getAttribute("data-active-id")).toBe("spot-0");

    const deck = screen.getByTestId("spots-deck");
    deck.focus();
    await userEvent.keyboard("{ArrowDown}");

    await waitFor(() => expect(screen.getByTestId("spots-deck").getAttribute("data-active-id")).toBe("spot-1"));
  });

  it("ArrowUp at the first card does not go negative", async () => {
    feedCerca.mockResolvedValue(makeCards(5));
    render(<SpotsDeck />);
    await screen.findAllByTestId("spot-card");

    const deck = screen.getByTestId("spots-deck");
    deck.focus();
    await userEvent.keyboard("{ArrowUp}");

    expect(screen.getByTestId("spots-deck").getAttribute("data-active-id")).toBe("spot-0");
  });
});

describe("SpotsDeck -- prefetch", () => {
  it("fetches a second page once the active card is within 3 of the end of a 10-card page", async () => {
    feedCerca.mockResolvedValueOnce(makeCards(10));
    feedCerca.mockResolvedValue([]);
    render(<SpotsDeck />);
    await screen.findAllByTestId("spot-card");
    expect(feedCerca).toHaveBeenCalledTimes(1);

    const deck = screen.getByTestId("spots-deck");
    deck.focus();
    for (let i = 0; i < 7; i++) {
      await userEvent.keyboard("{ArrowDown}");
    }

    await waitFor(() => expect(feedCerca).toHaveBeenCalledTimes(2));
  });
});

describe("SpotsDeck -- save toggle (optimistic + rollback)", () => {
  it("marks the card saved immediately on click, before saveSpot resolves", async () => {
    feedCerca.mockResolvedValue(makeCards(1));
    let resolveSave!: () => void;
    saveSpot.mockReturnValue(new Promise<void>((resolve) => (resolveSave = resolve)));
    const user = userEvent.setup();
    render(<SpotsDeck />);
    await screen.findByText("save-spot-0");

    await user.click(screen.getByText("save-spot-0"));

    expect(screen.getByTestId("spot-card").getAttribute("data-is-saved")).toBe("true");
    resolveSave();
  });

  it("rolls back to unsaved when saveSpot rejects", async () => {
    feedCerca.mockResolvedValue(makeCards(1));
    saveSpot.mockRejectedValue(new Error("network error"));
    const user = userEvent.setup();
    render(<SpotsDeck />);
    await screen.findByText("save-spot-0");

    await user.click(screen.getByText("save-spot-0"));

    await waitFor(() => expect(screen.getByTestId("spot-card").getAttribute("data-is-saved")).toBe("false"));
  });
});

// Live-browser-check regression net: a useEffect dependency array that
// changes length between renders (e.g. one that conditionally includes the
// deep-link callback) makes React log "The final argument passed to
// useEffect changed size between renders." This asserts the deck's own
// effects never trigger that warning, deep-linked or not.
describe("SpotsDeck -- effect dependency-array stability (regression net)", () => {
  it("never logs a 'changed size between renders' warning when rendered with a ?spot= deep link", async () => {
    searchParams = new URLSearchParams({ spot: "spot-2" });
    feedCerca.mockResolvedValue(makeCards(5));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<SpotsDeck />);
    await waitFor(() =>
      expect(screen.getByTestId("spots-deck").getAttribute("data-active-id")).toBe("spot-2"),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    const offendingCall = errorSpy.mock.calls.find((call) =>
      String(call[0]).includes("changed size between renders"),
    );
    expect(offendingCall).toBeUndefined();
    errorSpy.mockRestore();
  });

  it("never logs a 'changed size between renders' warning when rendered without a deep link", async () => {
    feedCerca.mockResolvedValue(makeCards(5));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<SpotsDeck />);
    await screen.findAllByTestId("spot-card");
    await new Promise((resolve) => setTimeout(resolve, 20));

    const offendingCall = errorSpy.mock.calls.find((call) =>
      String(call[0]).includes("changed size between renders"),
    );
    expect(offendingCall).toBeUndefined();
    errorSpy.mockRestore();
  });
});

// Fix round (expected red): a failed feed load currently falls through to
// the same empty-lane ("No spots yet") UI as a lane that's genuinely empty,
// with no indication anything went wrong and no way to retry. COPY.couldNotLoad
// doesn't exist yet either (see copy.test.ts), so this fails for two related
// reasons: the missing copy key and the missing error/retry UI.
describe("SpotsDeck -- feed repo failure (fix round)", () => {
  it("shows COPY.couldNotLoad and a retry control when the feed rejects, not the empty-lane state", async () => {
    feedCerca.mockRejectedValue(new Error("network down"));
    render(<SpotsDeck />);

    expect(await screen.findByText(new RegExp(COPY.couldNotLoad.en, "i"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(COPY.noSpotsYet.en, "i"))).not.toBeInTheDocument();
  });

  // Complements the case above: today `loadFirstPage`'s try/finally has no
  // catch, so a rejected feed call escapes as an unhandled promise
  // rejection (visible in this suite's own run as a "Vitest caught 1
  // unhandled error" warning) on top of showing the wrong UI. The deck must
  // catch its own fetch failures.
  it("never produces an unhandled promise rejection when the feed rejects", async () => {
    feedCerca.mockRejectedValue(new Error("network down"));
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    try {
      render(<SpotsDeck />);
      await waitFor(() => expect(feedCerca).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});

describe("SpotsDeck -- bulk (windowing)", () => {
  it("renders at most 5 spot-card DOM nodes even with 200 cards loaded", async () => {
    feedCerca.mockResolvedValue(makeCards(200));
    render(<SpotsDeck />);

    await screen.findAllByTestId("spot-card");
    expect(activeIds().length).toBeLessThanOrEqual(5);
  });
});

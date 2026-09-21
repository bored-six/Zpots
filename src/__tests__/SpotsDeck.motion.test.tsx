import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, AuthUser } from "@/lib/auth";
import type { SpotCard } from "@/lib/spots";

/**
 * Paseo motion pass, Wave 2.1 (.claude/prds/paseo-motion.md) -- the deck's
 * two prerequisite fixes: a real scroll-driven active index, and the slot
 * markup (.paseo-slot/data-index/data-active) the CSS in globals.css keys
 * off of. Same mock harness as SpotsDeck.test.tsx, plus a stubbed
 * IntersectionObserver (jsdom has none) so the observer wiring itself can
 * be exercised at the unit level.
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
  default: (props: { card: SpotCard }) => (
    <div data-testid="spot-card" data-spot-id={props.card.id} />
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

/** jsdom ships no IntersectionObserver at all -- this stands in for the
 * real thing so the component's observer wiring can be driven by hand. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  observed: Element[] = [];
  disconnected = false;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(element: Element) {
    this.observed.push(element);
  }

  unobserve(element: Element) {
    this.observed = this.observed.filter((el) => el !== element);
  }

  disconnect() {
    this.disconnected = true;
    this.observed = [];
  }

  takeRecords() {
    return [];
  }
}

function fireIntersection(observer: FakeIntersectionObserver, target: Element, ratio: number) {
  observer.callback(
    [
      {
        isIntersecting: ratio > 0,
        intersectionRatio: ratio,
        target,
      } as IntersectionObserverEntry,
    ],
    observer as unknown as IntersectionObserver,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
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
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("SpotsDeck -- slot attributes", () => {
  it("every rendered slot carries a distinct data-index, and exactly one is data-active", async () => {
    feedCerca.mockResolvedValue(makeCards(5));
    const { container } = render(<SpotsDeck />);
    await screen.findAllByTestId("spot-card");

    const slots = Array.from(container.querySelectorAll(".paseo-slot"));
    expect(slots.length).toBeGreaterThan(0);

    const indices = slots.map((el) => el.getAttribute("data-index"));
    expect(new Set(indices).size).toBe(indices.length);

    const active = slots.filter((el) => el.getAttribute("data-active") === "true");
    expect(active).toHaveLength(1);
    expect(active[0].getAttribute("data-index")).toBe("0");
  });

  it("moving the active index moves which slot is data-active", async () => {
    feedCerca.mockResolvedValue(makeCards(5));
    const { container } = render(<SpotsDeck />);
    await screen.findAllByTestId("spot-card");

    const deck = screen.getByTestId("spots-deck");
    deck.focus();
    await userEvent.keyboard("{ArrowDown}");

    await waitFor(() => expect(deck.getAttribute("data-active-id")).toBe("spot-1"));
    const active = Array.from(container.querySelectorAll('.paseo-slot[data-active="true"]'));
    expect(active).toHaveLength(1);
    expect(active[0].getAttribute("data-index")).toBe("1");
  });
});

describe("SpotsDeck -- scroll-driven active index", () => {
  it("a slot crossing the visibility threshold in the IntersectionObserver callback becomes the active card", async () => {
    feedCerca.mockResolvedValue(makeCards(5));
    const { container } = render(<SpotsDeck />);
    await screen.findAllByTestId("spot-card");
    expect(screen.getByTestId("spots-deck").getAttribute("data-active-id")).toBe("spot-0");

    const observer = FakeIntersectionObserver.instances.at(-1);
    expect(observer).toBeTruthy();
    const targetSlot = Array.from(container.querySelectorAll(".paseo-slot")).find(
      (el) => el.getAttribute("data-index") === "2",
    );
    expect(targetSlot).toBeTruthy();

    fireIntersection(observer!, targetSlot!, 0.9);

    await waitFor(() =>
      expect(screen.getByTestId("spots-deck").getAttribute("data-active-id")).toBe("spot-2"),
    );
  });

  it("an entry below the visibility threshold does not change the active card", async () => {
    feedCerca.mockResolvedValue(makeCards(5));
    const { container } = render(<SpotsDeck />);
    await screen.findAllByTestId("spot-card");

    const observer = FakeIntersectionObserver.instances.at(-1)!;
    const targetSlot = Array.from(container.querySelectorAll(".paseo-slot")).find(
      (el) => el.getAttribute("data-index") === "1",
    )!;

    fireIntersection(observer, targetSlot, 0.2);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(screen.getByTestId("spots-deck").getAttribute("data-active-id")).toBe("spot-0");
  });

  it("re-observes when the +/-2 render window shifts (old observer disconnected, a new one takes over)", async () => {
    feedCerca.mockResolvedValue(makeCards(10));
    render(<SpotsDeck />);
    await screen.findAllByTestId("spot-card");
    const firstObserver = FakeIntersectionObserver.instances.at(-1)!;

    const deck = screen.getByTestId("spots-deck");
    deck.focus();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => expect(deck.getAttribute("data-active-id")).toBe("spot-1"));

    expect(firstObserver.disconnected).toBe(true);
    expect(FakeIntersectionObserver.instances.length).toBeGreaterThan(1);
  });

  it("does not fight a programmatic move: an ArrowDown press lands on and stays on the next card", async () => {
    feedCerca.mockResolvedValue(makeCards(5));
    render(<SpotsDeck />);
    await screen.findAllByTestId("spot-card");

    const deck = screen.getByTestId("spots-deck");
    deck.focus();
    await userEvent.keyboard("{ArrowDown}");

    await waitFor(() => expect(deck.getAttribute("data-active-id")).toBe("spot-1"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(deck.getAttribute("data-active-id")).toBe("spot-1");
  });
});

describe("SpotsDeck -- regression: existing programmatic paths still move the index", () => {
  it("ArrowDown still moves the active card forward", async () => {
    feedCerca.mockResolvedValue(makeCards(5));
    render(<SpotsDeck />);
    await screen.findAllByTestId("spot-card");
    expect(screen.getByTestId("spots-deck").getAttribute("data-active-id")).toBe("spot-0");

    const deck = screen.getByTestId("spots-deck");
    deck.focus();
    await userEvent.keyboard("{ArrowDown}");

    await waitFor(() => expect(screen.getByTestId("spots-deck").getAttribute("data-active-id")).toBe("spot-1"));
  });

  it("a Hoy tap still moves the active card to that spot", async () => {
    feedCerca.mockResolvedValue(makeCards(5));
    hoyRow.mockResolvedValue([{ spotId: "spot-3", author: { id: "u", handle: "h", displayName: "H", avatarUrl: null } }]);
    const user = userEvent.setup();
    render(<SpotsDeck />);
    await screen.findByText("hoy-spot-3");

    await user.click(screen.getByText("hoy-spot-3"));

    await waitFor(() => expect(screen.getByTestId("spots-deck").getAttribute("data-active-id")).toBe("spot-3"));
  });
});

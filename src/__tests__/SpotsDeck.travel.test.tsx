import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, AuthUser } from "@/lib/auth";
import type { LatLng } from "@/lib/geo";
import type { SpotCard } from "@/lib/spots";

/**
 * paseo-motion.md, phone-inset travel fix -- SpotsDeck is the only thing
 * that knows both "which card is active" and "the full card list", so it is
 * the only place that can supply a not-yet-active card's *previous* spot
 * (SpotCardView.tsx and MapInsetInner.tsx have no visibility into siblings).
 * This file asserts the wiring SpotsDeck must feed each SpotCardView: an
 * `active` flag (exactly one true at a time) and a `previousCenter` equal to
 * whichever card was active immediately before the current one -- not the
 * card two positions back, and not undefined once a real walk is underway.
 *
 * Mocks SpotCardView down to a prop-recording stub (same mocking strategy as
 * SpotsDeck.motion.test.tsx) so this stays a pure wiring test, independent
 * of SpotCardView's own rendering.
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
  useRouter: () => ({ replace: vi.fn() }),
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

/** Every SpotCardView render, in order, so a test can inspect what a given
 * card id was passed on its most recent render as well as the full history. */
const cardRenders: Array<{ id: string; active?: boolean; previousCenter?: LatLng | null }> = [];

vi.mock("@/components/SpotCardView", () => ({
  default: (props: { card: SpotCard; active?: boolean; previousCenter?: LatLng | null }) => {
    cardRenders.push({ id: props.card.id, active: props.active, previousCenter: props.previousCenter });
    return <div data-testid="spot-card" data-spot-id={props.card.id} />;
  },
}));

vi.mock("@/components/HoyRow", () => ({
  default: () => <div data-testid="hoy-row" />,
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
    lat: 6.9 + i * 0.01,
    lng: 122.05 + i * 0.01,
    status: "unconfirmed" as const,
    confirmations: 0,
    createdAt: new Date(2026, 0, i + 1).toISOString(),
    author: { id: "user-2", handle: "kuya_ben", displayName: "Kuya Ben", avatarUrl: null },
  }));
}

/** The most recent render seen for a given card id, or undefined if it was
 * never rendered at all. */
function lastRenderFor(id: string) {
  return cardRenders.filter((entry) => entry.id === id).at(-1);
}

/**
 * The render where a card first transitioned to active -- the one render
 * whose `previousCenter` prop is the value `MapInsetInner`'s activation
 * effect actually reads (see MapInsetInner.tsx's `FlyToCenter`: it reads
 * `previousCenter` fresh only at the moment `active` flips true). A card
 * that's already active keeps re-rendering afterward as `previousCenter`
 * (shared deck-wide state) advances for the *next* future transition, so
 * checking the *last* render here would assert something the real
 * component never actually uses.
 */
function firstActiveRenderFor(id: string) {
  return cardRenders.find((entry) => entry.id === id && entry.active === true);
}

beforeEach(() => {
  cardRenders.length = 0;
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

describe("SpotsDeck -- wiring active/previousCenter for the per-card travel fix", () => {
  it("exactly one mounted card is active, and it is the current activeIndex's card", async () => {
    feedCerca.mockResolvedValue(makeCards(5));
    render(<SpotsDeck />);
    await screen.findAllByTestId("spot-card");

    const activeRenders = ["spot-0", "spot-1", "spot-2"].map((id) => lastRenderFor(id));
    const activeFlags = activeRenders.map((r) => r?.active === true);
    expect(activeFlags.filter(Boolean)).toHaveLength(1);
    expect(lastRenderFor("spot-0")?.active).toBe(true);
  });

  it("the very first active card (nothing walked yet) gets no previousCenter to travel from", async () => {
    feedCerca.mockResolvedValue(makeCards(5));
    render(<SpotsDeck />);
    await screen.findAllByTestId("spot-card");

    expect(firstActiveRenderFor("spot-0")?.previousCenter ?? null).toBeNull();
  });

  it("a card becoming active receives the previous spot's own coordinates as previousCenter", async () => {
    feedCerca.mockResolvedValue(makeCards(5));
    render(<SpotsDeck />);
    await screen.findAllByTestId("spot-card");

    const deck = screen.getByTestId("spots-deck");
    deck.focus();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => expect(deck.getAttribute("data-active-id")).toBe("spot-1"));

    expect(lastRenderFor("spot-1")?.active).toBe(true);
    expect(firstActiveRenderFor("spot-1")?.previousCenter).toEqual({ lat: 6.9, lng: 122.05 });
  });

  it("the card that just lost activity is no longer marked active", async () => {
    feedCerca.mockResolvedValue(makeCards(5));
    render(<SpotsDeck />);
    await screen.findAllByTestId("spot-card");

    const deck = screen.getByTestId("spots-deck");
    deck.focus();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => expect(deck.getAttribute("data-active-id")).toBe("spot-1"));

    expect(lastRenderFor("spot-0")?.active).toBe(false);
  });

  it("advancing again uses the immediately preceding spot, not an older one, as previousCenter", async () => {
    feedCerca.mockResolvedValue(makeCards(5));
    render(<SpotsDeck />);
    await screen.findAllByTestId("spot-card");

    const deck = screen.getByTestId("spots-deck");
    deck.focus();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => expect(deck.getAttribute("data-active-id")).toBe("spot-1"));
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => expect(deck.getAttribute("data-active-id")).toBe("spot-2"));

    // spot-1's own coordinates (the card just left behind), not spot-0's.
    expect(firstActiveRenderFor("spot-2")?.previousCenter).toEqual({ lat: 6.91, lng: 122.06 });
  });
});

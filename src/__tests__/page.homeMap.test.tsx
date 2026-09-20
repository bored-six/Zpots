import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, AuthUser } from "@/lib/auth";
import type { SpotCard } from "@/lib/spots";

/**
 * Regression coverage for the "Invalid LatLng object: (NaN, NaN)" full-page
 * crash (src/components/MapInsetInner.tsx): `HomeContent` (src/app/page.tsx)
 * renders a desktop-only map inset next to the deck, panned to whichever
 * card is currently active. Before the deck's first page of cards has
 * loaded, there is no active card yet -- this file proves that moment never
 * hands the map inset an unusable (undefined) center, and that once a real
 * card loads, the inset gets a genuinely finite one.
 *
 * Unlike page.test.tsx (which mocks SpotsDeck away entirely), this file
 * renders the real SpotsDeck so `onActiveCardChange` actually fires --
 * that's the wiring under test.
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
const routerPush = vi.fn();
const routerReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: routerReplace, push: routerPush }),
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

vi.mock("@/components/HoyRow", () => ({
  default: () => <div data-testid="hoy-row" />,
}));

// The per-card inset (SpotCardView -> MapInset) isn't what's under test
// here; only the desktop right-column usage in page.tsx is. Stubbing
// SpotCardView keeps this file from also having to stand up
// ConfirmButton/ReportButton/SignInPrompt's own dependencies.
vi.mock("@/components/SpotCardView", () => ({
  default: (props: { card: SpotCard }) => <div data-testid="spot-card" data-spot-id={props.card.id} />,
}));

// Captures every center this test's desktop map inset (page.tsx's `fill`
// MapInset) is rendered with -- the single source of truth for both
// assertions below.
const mapInsetCalls: unknown[] = [];
vi.mock("@/components/MapInset", () => ({
  default: (props: { center: { lat: number; lng: number }; fill?: boolean }) => {
    mapInsetCalls.push(props.center);
    return (
      <div
        data-testid="map-inset"
        data-lat={String(props.center?.lat)}
        data-lng={String(props.center?.lng)}
      />
    );
  },
}));

function authValue(status: AuthStatus, user: AuthUser | null = null) {
  return { status, user, signOut: vi.fn() };
}

function makeCard(overrides: Partial<SpotCard> = {}): SpotCard {
  return {
    id: "spot-1",
    name: "Fort Pilar",
    note: "A note.",
    lat: 6.9098,
    lng: 122.079,
    status: "unconfirmed",
    confirmations: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    author: { id: "user-2", handle: "kuya_ben", displayName: "Kuya Ben", avatarUrl: null },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mapInsetCalls.length = 0;
  useAuthMock.mockReturnValue(authValue("signed-out"));
  useLocationMock.mockReturnValue({
    status: "granted",
    coords: { lat: 6.9106, lng: 122.0736 },
    isFallback: false,
  });
  feedNuevo.mockResolvedValue([]);
  feedSiguiendo.mockResolvedValue([]);
  hoyRow.mockResolvedValue([]);
  mySavedIds.mockResolvedValue(new Set<string>());
  fetchMyConfirmedSpotIds.mockResolvedValue(new Set<string>());
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("Home (/) desktop map inset -- pre-first-card render", () => {
  it("never renders the map inset before the first page of cards has loaded", async () => {
    // Never resolves during this test -- the deck is permanently in its
    // initial "no card active yet" state.
    feedCerca.mockReturnValue(new Promise<SpotCard[]>(() => {}));

    const Home = (await import("@/app/page")).default;
    render(<Home />);

    await waitFor(() => expect(feedCerca).toHaveBeenCalled());

    expect(screen.queryByTestId("map-inset")).not.toBeInTheDocument();
    expect(mapInsetCalls).toHaveLength(0);
  });

  it("renders the map inset with a finite center once the first real card loads", async () => {
    feedCerca.mockResolvedValue([makeCard()]);

    const Home = (await import("@/app/page")).default;
    render(<Home />);

    const inset = await screen.findByTestId("map-inset");
    expect(Number.isFinite(Number(inset.getAttribute("data-lat")))).toBe(true);
    expect(Number.isFinite(Number(inset.getAttribute("data-lng")))).toBe(true);
    expect(inset.getAttribute("data-lat")).toBe("6.9098");
    expect(inset.getAttribute("data-lng")).toBe("122.079");
  });
});

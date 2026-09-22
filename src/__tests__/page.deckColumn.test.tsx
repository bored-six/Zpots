import fs from "node:fs";
import path from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, AuthUser } from "@/lib/auth";
import type { SpotCard } from "@/lib/spots";

/**
 * Replaces page.homeMap.test.tsx (deleted alongside this file): the
 * desktop right-column map it covered (a second, larger `MapInset fill`
 * beside the deck, panned to whichever card was active) is removed
 * entirely -- every spot card already carries its own map inset
 * (SpotCardView -> MapInset), so a second one was redundant screen real
 * estate, not a second feature. Desktop briefly centered the deck as a
 * single phone-width column instead (Reels/TikTok-style web feed); that
 * left dead space on wide monitors and was reverted the same day (see
 * CLAUDE.md item 7) in favor of the deck filling the screen edge to edge
 * beside the nav rail, the same way phone already presents it.
 *
 * jsdom does not lay out real pixels, so nothing here proves the deck
 * visually fills the viewport -- only that (a) the second map is
 * genuinely gone (no `MapInset` import/render survives in page.tsx at
 * all, not just hidden by CSS), and (b) no leftover width-cap/centering
 * classes from the reverted column design survive on the deck's wrapper.
 * A real-browser check (bounding rects) is required to confirm the
 * visual result -- see the PR notes for those numbers.
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

// The per-card inset (SpotCardView -> MapInset) isn't what's under test --
// only whether page.tsx itself still mounts a second, standalone MapInset.
vi.mock("@/components/SpotCardView", () => ({
  default: (props: { card: SpotCard }) => <div data-testid="spot-card" data-spot-id={props.card.id} />,
}));

// If page.tsx still imported and rendered a page-level MapInset, this mock
// would record it. Its whole existence in this file is temporary scaffolding
// to prove the negative -- kept minimal on purpose.
const pageLevelMapInsetCalls: unknown[] = [];
vi.mock("@/components/MapInset", () => ({
  default: (props: { center: { lat: number; lng: number }; fill?: boolean }) => {
    pageLevelMapInsetCalls.push(props);
    return <div data-testid="map-inset" />;
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
  pageLevelMapInsetCalls.length = 0;
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

describe("Home (/) -- the desktop side map is gone", () => {
  it("never mounts a page-level MapInset, even once a real card has loaded", async () => {
    feedCerca.mockResolvedValue([makeCard()]);

    const Home = (await import("@/app/page")).default;
    render(<Home />);

    await screen.findByTestId("spot-card");
    // Give any would-be map-panning effect a chance to run before asserting
    // its absence.
    await waitFor(() => expect(feedCerca).toHaveBeenCalled());

    expect(screen.queryByTestId("map-inset")).not.toBeInTheDocument();
    expect(pageLevelMapInsetCalls).toHaveLength(0);
  });

  it("page.tsx source no longer imports MapInset at all (not just unrendered)", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf-8");
    expect(source).not.toMatch(/from "@\/components\/MapInset"/);
  });
});

describe("Home (/) -- the deck fills the screen beside the nav rail on desktop", () => {
  it("does not wrap SpotsDeck in a capped-width or centered column (the reverted design)", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf-8");

    // The old two-column split -- gone.
    expect(source).not.toMatch(/lg:flex-row/);

    // None of the reverted centered-column design's classes survive:
    // capped lg width, the ink ground it floated on, its shadow, or the
    // justify-center that centered it. The deck must stretch edge to edge
    // in the space `main`'s `lg:pl-24` leaves beside the rail, not float
    // as a column inside it.
    expect(source).not.toMatch(/lg:w-\[\d+px\]/);
    expect(source).not.toMatch(/justify-center/);
    expect(source).not.toMatch(/lg:bg-ink/);
    expect(source).not.toMatch(/lg:shadow/);
  });

  it("HomeContent's own wrapper divs stay full width at every breakpoint", async () => {
    const Home = (await import("@/app/page")).default;
    const { container } = render(<Home />);

    // Only page.tsx's own two wrapper divs -- not descendants belonging to
    // SpotsDeck/SpotCardView, which have their own unrelated layout classes.
    const root = container.firstElementChild as HTMLElement;
    const deckWrapper = root.firstElementChild as HTMLElement;

    for (const el of [root, deckWrapper]) {
      expect(el.className).toMatch(/\bw-full\b/);
      expect(el.className).not.toMatch(/lg:w-(?!full\b)\S+/);
    }
  });
});

describe("SpotsDeck -- onActiveCardChange plumbing removed with its only caller", () => {
  it("SpotsDeck source no longer declares an onActiveCardChange prop", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/SpotsDeck.tsx"), "utf-8");
    expect(source).not.toMatch(/onActiveCardChange/);
  });

  it("page.tsx source no longer references onActiveCardChange", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf-8");
    expect(source).not.toMatch(/onActiveCardChange/);
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, AuthUser } from "@/lib/auth";
import type { SpotCard } from "@/lib/spots";
import { COPY } from "@/lib/copy";

/**
 * Task A (`.claude/handoff/spec.md`, A.6): the Cerca lane's "Using the city
 * center" note is the user-visible half of the geolocation-watchdog fix --
 * whenever `useLocation()` reports `isFallback: true` (denied, unsupported,
 * out-of-city, OR the new watchdog timeout), the Cerca lane must say so.
 * `SpotsDeck.tsx:564` already renders this conditionally; no existing test
 * file asserts it (only `PostFlow.test.tsx:149` covers PostFlow's own
 * copy of the note). This file closes that gap.
 *
 * Harness copied verbatim from `SpotsDeck.test.tsx` (mocks for
 * next/navigation, AuthProvider, use-location, feed-repo, saves-repo,
 * spots-repo, SpotCardView, HoyRow) -- do not invent a new one.
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

const FALLBACK = { lat: 6.9106, lng: 122.0736 };

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

describe("SpotsDeck -- location fallback note (spec A.6)", () => {
  it("A.6.1 -- shows COPY.usingCenter.en on the Cerca lane when useLocation reports isFallback: true", async () => {
    useLocationMock.mockReturnValue({ status: "denied", coords: FALLBACK, isFallback: true });

    render(<SpotsDeck />);
    await waitFor(() => expect(feedCerca).toHaveBeenCalled());

    expect(screen.getByText(COPY.usingCenter.en)).toBeInTheDocument();
  });

  it("A.6.2 -- NEGATIVE: the note is absent when useLocation reports a real granted fix (isFallback: false)", async () => {
    useLocationMock.mockReturnValue({
      status: "granted",
      coords: { lat: 6.93, lng: 122.06 },
      isFallback: false,
    });

    render(<SpotsDeck />);
    await waitFor(() => expect(feedCerca).toHaveBeenCalled());

    expect(screen.queryByText(COPY.usingCenter.en)).not.toBeInTheDocument();
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, AuthUser } from "@/lib/auth";
import type { Profile } from "@/lib/profiles";
import { COPY } from "@/lib/copy";

/**
 * social-spots.md Testing section names exactly two things for this page:
 * "search calls repo, follow state" -- so this file is deliberately scoped
 * to the search box (calls searchProfiles) and the follow/following state
 * on each result, rather than guessing at the exact shape of the
 * un-named-in-the-PRD "Siguiendo" / "Gente nueva" list-fetching calls.
 */

const searchProfiles = vi.fn();
const follow = vi.fn();
const unfollow = vi.fn();
const isFollowing = vi.fn();
const followingIds = vi.fn();
const profilesByIds = vi.fn();
const feedNuevo = vi.fn();
const useAuthMock = vi.fn();

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/profiles-repo", () => ({
  searchProfiles: (...args: unknown[]) => searchProfiles(...args),
  follow: (...args: unknown[]) => follow(...args),
  unfollow: (...args: unknown[]) => unfollow(...args),
  isFollowing: (...args: unknown[]) => isFollowing(...args),
  followingIds: (...args: unknown[]) => followingIds(...args),
  // Not implemented yet (fix round) -- see the "Siguiendo" describe block below.
  profilesByIds: (...args: unknown[]) => profilesByIds(...args),
}));

vi.mock("@/lib/feed-repo", () => ({
  feedNuevo: (...args: unknown[]) => feedNuevo(...args),
}));

function authValue(status: AuthStatus, user: AuthUser | null = null) {
  return { status, user, signOut: vi.fn() };
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "user-2",
    handle: "kuya_ben",
    displayName: "Kuya Ben",
    avatarUrl: null,
    needsHandle: false,
    followerCount: 0,
    followingCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue(authValue("signed-in", { id: "user-1", email: "a@b.com", nickname: "" }));
  searchProfiles.mockResolvedValue([]);
  isFollowing.mockResolvedValue(false);
  followingIds.mockResolvedValue(new Set<string>());
  profilesByIds.mockResolvedValue([]);
  feedNuevo.mockResolvedValue([]);
});

afterEach(() => {
  vi.resetAllMocks();
});

async function renderGentePage() {
  const GentePage = (await import("@/app/gente/page")).default;
  return render(<GentePage />);
}

describe("Gente page -- search", () => {
  it("has a search field reachable by the findPeople copy", async () => {
    await renderGentePage();

    expect(screen.getByRole("textbox", { name: new RegExp(COPY.findPeople.en, "i") })).toBeInTheDocument();
  });

  it("typing a query calls searchProfiles with that query", async () => {
    const user = userEvent.setup();
    await renderGentePage();

    await user.type(screen.getByRole("textbox", { name: new RegExp(COPY.findPeople.en, "i") }), "ben");

    await waitFor(() => expect(searchProfiles).toHaveBeenCalledWith("ben"));
  });

  it("renders the handle of each search result", async () => {
    searchProfiles.mockResolvedValue([makeProfile({ handle: "ben" })]);
    const user = userEvent.setup();
    await renderGentePage();

    await user.type(screen.getByRole("textbox", { name: new RegExp(COPY.findPeople.en, "i") }), "ben");

    expect(await screen.findByText(/@ben/i)).toBeInTheDocument();
  });
});

describe("Gente page -- follow state on results", () => {
  it("shows Follow for a result you don't already follow", async () => {
    searchProfiles.mockResolvedValue([makeProfile({ id: "user-2", handle: "ben" })]);
    isFollowing.mockResolvedValue(false);
    const user = userEvent.setup();
    await renderGentePage();
    await user.type(screen.getByRole("textbox", { name: new RegExp(COPY.findPeople.en, "i") }), "ben");
    await screen.findByText(/@ben/i);

    expect(screen.getByRole("button", { name: new RegExp(COPY.follow.en, "i") })).toBeInTheDocument();
  });

  it("shows Following for a result you already follow", async () => {
    searchProfiles.mockResolvedValue([makeProfile({ id: "user-2", handle: "ben" })]);
    isFollowing.mockResolvedValue(true);
    const user = userEvent.setup();
    await renderGentePage();
    await user.type(screen.getByRole("textbox", { name: new RegExp(COPY.findPeople.en, "i") }), "ben");
    await screen.findByText(/@ben/i);

    expect(await screen.findByRole("button", { name: new RegExp(COPY.followingState.en, "i") })).toBeInTheDocument();
  });

  it("clicking Follow on a result calls follow(id) and flips the button to Following", async () => {
    searchProfiles.mockResolvedValue([makeProfile({ id: "user-2", handle: "ben" })]);
    isFollowing.mockResolvedValue(false);
    const user = userEvent.setup();
    await renderGentePage();
    await user.type(screen.getByRole("textbox", { name: new RegExp(COPY.findPeople.en, "i") }), "ben");
    await screen.findByText(/@ben/i);

    await user.click(screen.getByRole("button", { name: new RegExp(COPY.follow.en, "i") }));

    expect(follow).toHaveBeenCalledWith("user-2");
    expect(screen.getByRole("button", { name: new RegExp(COPY.followingState.en, "i") })).toBeInTheDocument();
  });

  it("never shows a follow control for yourself in the results", async () => {
    searchProfiles.mockResolvedValue([makeProfile({ id: "user-1", handle: "me" })]);
    const user = userEvent.setup();
    await renderGentePage();
    await user.type(screen.getByRole("textbox", { name: new RegExp(COPY.findPeople.en, "i") }), "me");
    await screen.findByText(/@me/i);

    expect(screen.queryByRole("button", { name: new RegExp(COPY.follow.en, "i") })).not.toBeInTheDocument();
  });
});

/**
 * Fix round (expected red): the notes.md-documented limitation -- "Siguiendo
 * only surfaces followed accounts with a recent spot" -- is being fixed by
 * building the section from `followingIds()` + `profilesByIds()` directly,
 * not by filtering `feedNuevo()`'s authors. These two cases fail against the
 * current implementation, which never calls `profilesByIds` at all.
 */
describe("Gente page -- Siguiendo built from followingIds + profilesByIds (fix round)", () => {
  it("renders every followed account from followingIds()/profilesByIds(), even one with no recent spot", async () => {
    followingIds.mockResolvedValue(new Set(["user-5"]));
    profilesByIds.mockResolvedValue([
      makeProfile({ id: "user-5", handle: "no_recent_spots" }),
    ]);
    // Deliberately empty -- proves the section isn't sourced from the feed.
    feedNuevo.mockResolvedValue([]);

    await renderGentePage();

    expect(await screen.findByText(/@no_recent_spots/i)).toBeInTheDocument();
  });

  it("calls profilesByIds with exactly the ids followingIds() resolves", async () => {
    followingIds.mockResolvedValue(new Set(["user-5", "user-6"]));
    profilesByIds.mockResolvedValue([]);

    await renderGentePage();

    await waitFor(() => expect(profilesByIds).toHaveBeenCalled());
    const calledWith = profilesByIds.mock.calls[0][0] as string[];
    expect(new Set(calledWith)).toEqual(new Set(["user-5", "user-6"]));
  });
});

/**
 * Fix round (expected red): COPY.noPeopleYet doesn't exist yet, and the
 * empty Siguiendo/Gente nueva sections currently reuse `nobodyToday`
 * ("Nobody has gone out today") -- copy that belongs to the Hoy row, not a
 * plain "there's no one here" list state.
 */
describe("Gente page -- empty-section copy (fix round)", () => {
  it("shows COPY.noPeopleYet, not 'Nobody has gone out today', when Siguiendo is empty", async () => {
    followingIds.mockResolvedValue(new Set<string>());
    feedNuevo.mockResolvedValue([]);

    await renderGentePage();

    expect(await screen.findByText(new RegExp(COPY.noPeopleYet.en, "i"))).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(COPY.nobodyToday.en, "i"))).not.toBeInTheDocument();
  });

  it("shows COPY.noPeopleYet, not 'Nobody has gone out today', when Gente nueva is empty", async () => {
    followingIds.mockResolvedValue(new Set<string>());
    feedNuevo.mockResolvedValue([]);

    await renderGentePage();

    const noPeopleYetMatches = await screen.findAllByText(new RegExp(COPY.noPeopleYet.en, "i"));
    // Both empty sections (Siguiendo and Gente nueva) should use this copy.
    expect(noPeopleYetMatches.length).toBeGreaterThanOrEqual(2);
  });
});

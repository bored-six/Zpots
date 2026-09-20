import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, AuthUser } from "@/lib/auth";
import { COPY } from "@/lib/copy";

/**
 * Adversarial pass: empty/whitespace search input must never reach the
 * repo, and clearing a query after a real one must not leave stale results
 * on screen. (Mirrors gente-page.test.tsx's mock harness.)
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
  profilesByIds: (...args: unknown[]) => profilesByIds(...args),
}));

vi.mock("@/lib/feed-repo", () => ({
  feedNuevo: (...args: unknown[]) => feedNuevo(...args),
}));

function authValue(status: AuthStatus, user: AuthUser | null = null) {
  return { status, user, signOut: vi.fn() };
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

describe("adversarial: Gente search input", () => {
  it("typing only whitespace never calls searchProfiles", async () => {
    const user = userEvent.setup();
    await renderGentePage();

    await user.type(
      screen.getByRole("textbox", { name: new RegExp(COPY.findPeople.en, "i") }),
      "   ",
    );
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(searchProfiles).not.toHaveBeenCalled();
  });

  it("clearing a query back to empty never calls searchProfiles for the empty string, and drops the stale results list", async () => {
    searchProfiles.mockResolvedValue([
      {
        id: "user-2",
        handle: "ben",
        displayName: "Ben",
        avatarUrl: null,
        needsHandle: false,
        followerCount: 0,
        followingCount: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const user = userEvent.setup();
    await renderGentePage();
    const input = screen.getByRole("textbox", { name: new RegExp(COPY.findPeople.en, "i") });

    await user.type(input, "ben");
    await screen.findByText(/@ben/i);

    await user.clear(input);

    await waitFor(() => expect(screen.queryByText(/@ben/i)).not.toBeInTheDocument());
    expect(searchProfiles).toHaveBeenCalledTimes(1);
    expect(searchProfiles).not.toHaveBeenCalledWith("");
  });

  it("an empty query on first render never calls searchProfiles at all", async () => {
    await renderGentePage();
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(searchProfiles).not.toHaveBeenCalled();
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, AuthUser } from "@/lib/auth";
import type { Profile } from "@/lib/profiles";
import type { SpotCard } from "@/lib/spots";
import { COPY } from "@/lib/copy";

const getProfileByHandle = vi.fn();
const follow = vi.fn();
const unfollow = vi.fn();
const isFollowing = vi.fn();
const spotsByUser = vi.fn();
const useAuthMock = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ handle: "kuya_ben" }),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/profiles-repo", () => ({
  getProfileByHandle: (...args: unknown[]) => getProfileByHandle(...args),
  follow: (...args: unknown[]) => follow(...args),
  unfollow: (...args: unknown[]) => unfollow(...args),
  isFollowing: (...args: unknown[]) => isFollowing(...args),
}));

vi.mock("@/lib/feed-repo", () => ({
  spotsByUser: (...args: unknown[]) => spotsByUser(...args),
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
    followerCount: 4,
    followingCount: 9,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSpotCard(overrides: Partial<SpotCard> = {}): SpotCard {
  return {
    id: "spot-1",
    name: "Fort Pilar",
    note: "Historic fort.",
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
  useAuthMock.mockReturnValue(authValue("signed-out"));
  spotsByUser.mockResolvedValue([]);
  isFollowing.mockResolvedValue(false);
});

afterEach(() => {
  vi.resetAllMocks();
});

async function renderProfilePage() {
  const ProfilePage = (await import("@/app/u/[handle]/page")).default;
  return render(<ProfilePage />);
}

describe("Profile page -- viewing someone else", () => {
  beforeEach(() => {
    getProfileByHandle.mockResolvedValue(makeProfile());
    useAuthMock.mockReturnValue(authValue("signed-in", { id: "user-1", email: "a@b.com", nickname: "" }));
  });

  it("shows the handle, display name, and follower/following counts", async () => {
    await renderProfilePage();

    expect(await screen.findByText(/@kuya_ben/i)).toBeInTheDocument();
    expect(screen.getByText("Kuya Ben")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("shows a Follow control (English name) when not already following", async () => {
    await renderProfilePage();

    expect(await screen.findByRole("button", { name: new RegExp(COPY.follow.en, "i") })).toBeInTheDocument();
  });

  it("clicking Follow optimistically flips to the Following state and calls follow(profileId)", async () => {
    const user = userEvent.setup();
    await renderProfilePage();
    const followButton = await screen.findByRole("button", { name: new RegExp(COPY.follow.en, "i") });

    await user.click(followButton);

    expect(screen.getByRole("button", { name: new RegExp(COPY.followingState.en, "i") })).toBeInTheDocument();
    expect(follow).toHaveBeenCalledWith("user-2");
  });

  it("rolls back to Follow when the follow() call rejects", async () => {
    follow.mockRejectedValue(new Error("network error"));
    const user = userEvent.setup();
    await renderProfilePage();
    const followButton = await screen.findByRole("button", { name: new RegExp(COPY.follow.en, "i") });

    await user.click(followButton);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: new RegExp(COPY.follow.en, "i") })).toBeInTheDocument(),
    );
  });

  it("when already following, shows the Following state and unfollowing rolls back on error", async () => {
    isFollowing.mockResolvedValue(true);
    unfollow.mockRejectedValue(new Error("network error"));
    const user = userEvent.setup();
    await renderProfilePage();
    const followingButton = await screen.findByRole("button", { name: new RegExp(COPY.followingState.en, "i") });

    await user.click(followingButton);
    expect(unfollow).toHaveBeenCalledWith("user-2");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: new RegExp(COPY.followingState.en, "i") })).toBeInTheDocument(),
    );
  });

  it("renders the user's spots from spotsByUser, linking each to the deck deep link", async () => {
    spotsByUser.mockResolvedValue([makeSpotCard({ id: "spot-7" })]);
    await renderProfilePage();

    const link = await screen.findByRole("link", { name: /fort pilar/i });
    expect(link).toHaveAttribute("href", "/?spot=spot-7");
  });
});

describe("Profile page -- viewing your own profile", () => {
  beforeEach(() => {
    getProfileByHandle.mockResolvedValue(makeProfile({ id: "user-1" }));
    useAuthMock.mockReturnValue(authValue("signed-in", { id: "user-1", email: "a@b.com", nickname: "" }));
  });

  it("never renders a follow/unfollow control on your own profile", async () => {
    await renderProfilePage();
    await screen.findByText(/@kuya_ben/i);

    expect(screen.queryByRole("button", { name: new RegExp(COPY.follow.en, "i") })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: new RegExp(COPY.followingState.en, "i") })).not.toBeInTheDocument();
    expect(isFollowing).not.toHaveBeenCalled();
  });

  it("shows the pick-a-handle banner while needsHandle is true", async () => {
    getProfileByHandle.mockResolvedValue(makeProfile({ id: "user-1", needsHandle: true }));
    await renderProfilePage();

    expect(await screen.findByText(new RegExp(COPY.pickHandle.en, "i"))).toBeInTheDocument();
  });

  it("hides the banner once needsHandle is false", async () => {
    getProfileByHandle.mockResolvedValue(makeProfile({ id: "user-1", needsHandle: false }));
    await renderProfilePage();
    await screen.findByText(/@kuya_ben/i);

    expect(screen.queryByText(new RegExp(COPY.pickHandle.en, "i"))).not.toBeInTheDocument();
  });
});

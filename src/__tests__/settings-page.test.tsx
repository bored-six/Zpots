import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, AuthUser } from "@/lib/auth";
import type { Profile } from "@/lib/profiles";

const replace = vi.fn();
const useAuthMock = vi.fn();
const updateNickname = vi.fn();
const fetchMyConfirmedSpotIds = vi.fn();
const signOutMock = vi.fn();
const getMyProfile = vi.fn();
const isHandleAvailable = vi.fn();
const updateHandle = vi.fn();
const updateDisplayName = vi.fn();
const updateAvatarUrl = vi.fn();
const uploadAvatar = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/auth", () => ({
  updateNickname: (...args: unknown[]) => updateNickname(...args),
}));

vi.mock("@/lib/spots-repo", () => ({
  fetchMyConfirmedSpotIds: (...args: unknown[]) => fetchMyConfirmedSpotIds(...args),
}));

// social-spots.md ("Settings" UI spec): handle edit + avatar upload are new
// here -- mocked the same way spots-repo/auth are above so the handle/
// display-name/avatar tests below don't hit the real Supabase client.
vi.mock("@/lib/profiles-repo", () => ({
  getMyProfile: (...args: unknown[]) => getMyProfile(...args),
  isHandleAvailable: (...args: unknown[]) => isHandleAvailable(...args),
  updateHandle: (...args: unknown[]) => updateHandle(...args),
  updateDisplayName: (...args: unknown[]) => updateDisplayName(...args),
  updateAvatarUrl: (...args: unknown[]) => updateAvatarUrl(...args),
  uploadAvatar: (...args: unknown[]) => uploadAvatar(...args),
}));

function authValue(status: AuthStatus, user: AuthUser | null = null) {
  return { status, user, signOut: signOutMock };
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "u1",
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
  fetchMyConfirmedSpotIds.mockResolvedValue(new Set<string>());
  signOutMock.mockResolvedValue(undefined);
  getMyProfile.mockResolvedValue(makeProfile());
  isHandleAvailable.mockResolvedValue(true);
});

afterEach(() => {
  vi.resetAllMocks();
});

async function renderSettingsPage() {
  const SettingsPage = (await import("@/app/settings/page")).default;
  return render(<SettingsPage />);
}

describe("Settings page -- loading", () => {
  it("shows a quiet loading line and nothing interactive", async () => {
    useAuthMock.mockReturnValue(authValue("loading"));
    await renderSettingsPage();

    expect(screen.getByText(/loading your account/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("Settings page -- signed out", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue(authValue("signed-out"));
  });

  it("shows a sign-in link to /login?next=/settings and does not redirect", async () => {
    await renderSettingsPage();

    // The header (ClipboardShell) also renders its own generic "Sign in"
    // link when signed out -- find the settings page's own, more specific one.
    const links = screen.getAllByRole("link", { name: /sign in/i });
    const settingsLink = links.find((link) => link.getAttribute("href") === "/login?next=/settings");
    expect(settingsLink).toBeDefined();
    expect(replace).not.toHaveBeenCalled();
  });

  it("includes the required OpenStreetMap attribution credit", async () => {
    await renderSettingsPage();
    expect(screen.getByText(/OpenStreetMap/i)).toBeInTheDocument();
  });

  it("contains a real link (not a div) back to the home page", async () => {
    await renderSettingsPage();
    const homeLink = screen.getByRole("link", { name: /home|back/i });
    expect(homeLink).toHaveAttribute("href", "/");
  });

  it("does not render the nickname field or a sign-out button", async () => {
    await renderSettingsPage();
    expect(screen.queryByRole("textbox", { name: /nickname/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
  });
});

describe("Settings page -- signed in", () => {
  const user: AuthUser = { id: "u1", email: "person@example.com", nickname: "Kuya Ben" };

  beforeEach(() => {
    useAuthMock.mockReturnValue(authValue("signed-in", user));
  });

  it("shows the account email read-only", async () => {
    await renderSettingsPage();
    expect(screen.getByText("person@example.com")).toBeInTheDocument();
  });

  // social-spots.md ("Settings" UI spec): "Adds handle edit and avatar
  // upload; nickname field removed." The nickname field (and updateNickname)
  // is gone from the signed-in settings view -- superseded by the handle
  // (`updateHandle`) and display name (`updateDisplayName`) fields below.
  // These three cases replace the pre-social-spots nickname-input tests
  // that used to live here.
  it("does not render a nickname textbox", async () => {
    await renderSettingsPage();
    expect(screen.queryByRole("textbox", { name: /nickname/i })).not.toBeInTheDocument();
  });

  it("renders a handle textbox pre-filled from the profile", async () => {
    getMyProfile.mockResolvedValue(makeProfile({ handle: "kuya_ben" }));
    await renderSettingsPage();

    const input = await screen.findByRole("textbox", { name: /handle/i });
    expect(input).toHaveValue("kuya_ben");
  });

  it("renders a display name textbox pre-filled from the profile", async () => {
    getMyProfile.mockResolvedValue(makeProfile({ displayName: "Kuya Ben" }));
    await renderSettingsPage();

    const input = await screen.findByRole("textbox", { name: /display name/i });
    expect(input).toHaveValue("Kuya Ben");
  });

  it("renders an avatar upload control", async () => {
    await renderSettingsPage();
    expect(screen.getByLabelText(/change avatar/i)).toBeInTheDocument();
  });

  it("renders the count of confirmed spots from fetchMyConfirmedSpotIds", async () => {
    fetchMyConfirmedSpotIds.mockResolvedValue(new Set(["a", "b", "c"]));
    await renderSettingsPage();

    await waitFor(() => expect(screen.getByText(/3/)).toBeInTheDocument());
  });

  it("shows '—' rather than 0 when fetchMyConfirmedSpotIds fails", async () => {
    fetchMyConfirmedSpotIds.mockRejectedValue(new Error("network down"));
    await renderSettingsPage();

    await waitFor(() => expect(screen.getByText("—")).toBeInTheDocument());
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
  });

  it("Sign out calls signOut() then navigates to /", async () => {
    const userEv = userEvent.setup();
    await renderSettingsPage();

    await userEv.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("no 'Clear my local data' control, no 'no accounts' copy remains", async () => {
    await renderSettingsPage();

    expect(screen.queryByRole("button", { name: /clear.*local data/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/no accounts/i)).not.toBeInTheDocument();
  });

  it("contains a real link back to the home page", async () => {
    await renderSettingsPage();
    const homeLink = screen.getByRole("link", { name: /home|back/i });
    expect(homeLink).toHaveAttribute("href", "/");
  });

  it("includes the required OpenStreetMap attribution credit", async () => {
    await renderSettingsPage();
    expect(screen.getByText(/OpenStreetMap/i)).toBeInTheDocument();
  });
});

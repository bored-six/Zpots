import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, AuthUser } from "@/lib/auth";

const replace = vi.fn();
const useAuthMock = vi.fn();
const updateNickname = vi.fn();
const fetchMyConfirmedSpotIds = vi.fn();
const signOutMock = vi.fn();

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

function authValue(status: AuthStatus, user: AuthUser | null = null) {
  return { status, user, signOut: signOutMock };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMyConfirmedSpotIds.mockResolvedValue(new Set<string>());
  signOutMock.mockResolvedValue(undefined);
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

  it("renders a nickname text input pre-filled from user.nickname", async () => {
    await renderSettingsPage();
    const input = screen.getByRole("textbox", { name: /nickname/i });
    expect(input).toHaveValue("Kuya Ben");
  });

  it("calls updateNickname with the trimmed value when the nickname field loses focus after being edited", async () => {
    const userEv = userEvent.setup();
    await renderSettingsPage();

    const input = screen.getByRole("textbox", { name: /nickname/i });
    await userEv.clear(input);
    await userEv.type(input, "  Ate Joy  ");
    await userEv.tab();

    await waitFor(() => expect(updateNickname).toHaveBeenCalledWith("Ate Joy"));
  });

  it("does not call updateNickname when the value on blur is unchanged", async () => {
    const userEv = userEvent.setup();
    await renderSettingsPage();

    const input = screen.getByRole("textbox", { name: /nickname/i });
    await userEv.click(input);
    await userEv.tab();

    expect(updateNickname).not.toHaveBeenCalled();
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

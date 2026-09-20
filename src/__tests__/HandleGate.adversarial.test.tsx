import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, AuthUser } from "@/lib/auth";

/**
 * HandleGate has no dedicated test file yet -- this covers the one
 * explicitly adversarial claim worth checking: the skip flag is scoped to
 * `sessionStorage` and must be respected across a remount within the same
 * session (social-spots.md "Handle gate": "Skippable once; banner on own
 * profile until set").
 */

const useAuthMock = vi.fn();
const getMyProfile = vi.fn();
const isHandleAvailable = vi.fn();
const updateHandle = vi.fn();

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/profiles-repo", () => ({
  getMyProfile: (...args: unknown[]) => getMyProfile(...args),
  isHandleAvailable: (...args: unknown[]) => isHandleAvailable(...args),
  updateHandle: (...args: unknown[]) => updateHandle(...args),
}));

function authValue(status: AuthStatus, user: AuthUser | null = null) {
  return { status, user, signOut: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  useAuthMock.mockReturnValue(authValue("signed-in", { id: "user-1", email: "a@b.com", nickname: "" }));
  getMyProfile.mockResolvedValue({
    id: "user-1",
    handle: "zp_abc12345",
    displayName: "",
    avatarUrl: null,
    needsHandle: true,
    followerCount: 0,
    followingCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
});

afterEach(() => {
  vi.resetAllMocks();
  window.sessionStorage.clear();
});

async function renderHandleGate() {
  const HandleGate = (await import("@/components/HandleGate")).default;
  return render(<HandleGate />);
}

describe("adversarial: HandleGate skip flag", () => {
  it("shows the modal on first mount when the profile needs a handle", async () => {
    await renderHandleGate();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("Skip dismisses the modal and sets the sessionStorage skip flag", async () => {
    const user = userEvent.setup();
    await renderHandleGate();
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: /cancel|skip/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem("zpots:handle-gate-skipped")).toBe("1");
  });

  it("does not nag again after Skip if the same HandleGate instance remounts within the same session", async () => {
    const user = userEvent.setup();
    const { unmount } = await renderHandleGate();
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /cancel|skip/i }));
    unmount();

    // Still needsHandle=true on the account -- only the session flag should
    // suppress the nag. (The component short-circuits on the session flag
    // before ever calling getMyProfile() again this session, which is why
    // this only asserts on the visible outcome rather than the call count.)
    await renderHandleGate();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does nag again in a fresh session (sessionStorage cleared) even though the account still needsHandle", async () => {
    const user = userEvent.setup();
    const { unmount } = await renderHandleGate();
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /cancel|skip/i }));
    unmount();

    window.sessionStorage.clear(); // simulates a brand new browser session

    await renderHandleGate();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

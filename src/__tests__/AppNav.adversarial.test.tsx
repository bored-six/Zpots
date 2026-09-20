import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, AuthUser } from "@/lib/auth";

/**
 * AppNav has no opinion on auth state -- the camera tab always links to
 * /post, signed in or out, and PostFlow itself is what gates. This confirms
 * that combination end-to-end: the nav link is always present and PostFlow
 * (rendered as if the user had followed it while signed out) shows a gate
 * instead of crashing or skipping the sign-in requirement.
 */

let pathname = "/";
const useAuthMock = vi.fn();
const useLocationMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/use-location", () => ({
  useLocation: () => useLocationMock(),
}));

function authValue(status: AuthStatus, user: AuthUser | null = null) {
  return { status, user, signOut: vi.fn() };
}

beforeEach(() => {
  pathname = "/";
  useAuthMock.mockReturnValue(authValue("signed-out"));
  useLocationMock.mockReturnValue({
    status: "denied",
    coords: { lat: 6.9106, lng: 122.0736 },
    isFallback: true,
  });
});

describe("adversarial: AppNav camera route + signed-out PostFlow", () => {
  it("AppNav's camera link always points to /post regardless of auth state", async () => {
    const AppNav = (await import("@/components/AppNav")).default;
    const { container } = render(<AppNav />);

    expect(container.querySelector('a[href="/post"]')).toBeTruthy();
  });

  it("following that link while signed out never crashes -- PostFlow renders a sign-in gate instead of the camera step", async () => {
    const PostFlow = (await import("@/components/PostFlow")).default;

    expect(() => render(<PostFlow />)).not.toThrow();
    expect(await screen.findByText(/sign in/i)).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
  });
});

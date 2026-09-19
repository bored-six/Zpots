import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const subscribeToAuth = vi.fn();
const purgeLegacyLocalData = vi.fn();
const signOut = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: (...args: unknown[]) => getSession(...args),
  subscribeToAuth: (...args: unknown[]) => subscribeToAuth(...args),
  purgeLegacyLocalData: (...args: unknown[]) => purgeLegacyLocalData(...args),
  signOut: (...args: unknown[]) => signOut(...args),
  // Real toAuthUser maps a raw supabase User -> AuthUser; here the fake
  // "session.user" already looks like an AuthUser, so passthrough is enough.
  toAuthUser: (user: unknown) => user,
}));

import AuthProvider, { useAuth } from "@/components/AuthProvider";

function Probe() {
  const { status, user } = useAuth();
  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="user-id">{user?.id ?? ""}</div>
    </div>
  );
}

function makeUser(id = "user-1") {
  return { id, email: `${id}@example.com`, nickname: "" };
}

/** getSession() resolves a raw Session-shaped object with a `.user`. */
function makeSession(id = "user-1") {
  return { access_token: "token", user: makeUser(id) };
}

describe("AuthProvider / useAuth", () => {
  it("useAuth throws when used outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow();
    spy.mockRestore();
  });

  it("resolves to signed-out when getSession() yields null", async () => {
    getSession.mockResolvedValue(null);
    subscribeToAuth.mockReturnValue(vi.fn());

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-out"));
  });

  it("resolves to signed-in with the mapped user when getSession() yields a session", async () => {
    getSession.mockResolvedValue(makeSession("user-77"));
    subscribeToAuth.mockReturnValue(vi.fn());

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-in"));
    expect(screen.getByTestId("user-id")).toHaveTextContent("user-77");
  });

  it("flips state when subscribeToAuth's callback fires with a user, then with null", async () => {
    getSession.mockResolvedValue(null);
    let callback!: (user: unknown) => void;
    subscribeToAuth.mockImplementation((cb: (user: unknown) => void) => {
      callback = cb;
      return vi.fn();
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-out"));

    callback(makeUser("user-3"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-in"));
    expect(screen.getByTestId("user-id")).toHaveTextContent("user-3");

    callback(null);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-out"));
  });

  it("calls the unsubscribe function returned by subscribeToAuth on unmount", async () => {
    getSession.mockResolvedValue(null);
    const unsubscribe = vi.fn();
    subscribeToAuth.mockReturnValue(unsubscribe);

    const { unmount } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-out"));

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("calls purgeLegacyLocalData exactly once on mount", async () => {
    getSession.mockResolvedValue(null);
    subscribeToAuth.mockReturnValue(vi.fn());
    purgeLegacyLocalData.mockClear();

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-out"));
    expect(purgeLegacyLocalData).toHaveBeenCalledTimes(1);
  });

  it("starts in the loading state before getSession() resolves", () => {
    let resolveSession!: (value: unknown) => void;
    getSession.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    subscribeToAuth.mockReturnValue(vi.fn());

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    resolveSession(null);
  });
});

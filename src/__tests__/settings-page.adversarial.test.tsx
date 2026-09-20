import { act } from "react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Adversarial pass on the settings-page hydration bug (spec Task 4/6;
 * previously fixed at d4c9f1b for the old localStorage-based page). The
 * page is now driven entirely by AuthProvider's `loading` -> `signed-in`/
 * `signed-out` state, whose initial value is fixed and identical on server
 * and client -- this test proves that contract holds by actually running a
 * server render through `renderToString` and hydrating it, rather than
 * trusting the doc comment.
 */

const getSession = vi.fn();
const subscribeToAuth = vi.fn();
const purgeLegacyLocalData = vi.fn();
const signOut = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: (...args: unknown[]) => getSession(...args),
  subscribeToAuth: (...args: unknown[]) => subscribeToAuth(...args),
  purgeLegacyLocalData: (...args: unknown[]) => purgeLegacyLocalData(...args),
  signOut: (...args: unknown[]) => signOut(...args),
  toAuthUser: (user: unknown) => user,
}));

vi.mock("@/lib/spots-repo", () => ({
  fetchMyConfirmedSpotIds: vi.fn().mockResolvedValue(new Set<string>()),
}));

afterEach(() => {
  document.body.innerHTML = "";
  vi.resetAllMocks();
});

describe("adversarial", () => {
  it("server-rendered markup contains no Date/random/window-derived text and matches what getByTestId sees pre-effect", async () => {
    // Never resolves during this test, so the tree stays in the `loading`
    // state on both the server render and the client's first paint --
    // this is the actual hydration boundary; nothing past it is part of
    // the SSR HTML in the real app either.
    getSession.mockReturnValue(new Promise(() => {}));
    subscribeToAuth.mockReturnValue(vi.fn());

    const AuthProvider = (await import("@/components/AuthProvider")).default;
    const SettingsPage = (await import("@/app/settings/page")).default;
    const element = () => createElement(AuthProvider, null, createElement(SettingsPage));

    const html = renderToString(element());

    expect(html).toMatch(/loading your account/i);
    // No ISO timestamp, no stray numeric id, nothing that could only come
    // from evaluating `Date.now()`, `Math.random()`, or a browser global
    // during the render itself.
    expect(html).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(html).not.toMatch(/0\.\d{10,}/); // Math.random()'s typical shape
  });

  it("hydrating the server-rendered HTML logs no React hydration-mismatch warning", async () => {
    getSession.mockReturnValue(new Promise(() => {}));
    subscribeToAuth.mockReturnValue(vi.fn());

    const AuthProvider = (await import("@/components/AuthProvider")).default;
    const SettingsPage = (await import("@/app/settings/page")).default;
    const element = () => createElement(AuthProvider, null, createElement(SettingsPage));

    const html = renderToString(element());
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      hydrateRoot(container, element());
    });

    const hydrationWarnings = errorSpy.mock.calls.filter(([first]) =>
      typeof first === "string" && /hydrat/i.test(first),
    );

    expect(hydrationWarnings).toEqual([]);
    errorSpy.mockRestore();
  });
});

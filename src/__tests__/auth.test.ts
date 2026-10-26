import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_NICKNAME_LENGTH } from "@/lib/validation";

// auth.ts is expected to call getSupabaseClient() from this module to reach
// GoTrue -- replace it with a fully mocked/fake `auth` object and never
// touch a real Supabase project, same pattern as spots-repo.test.ts.
vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from "@/lib/supabase";
import {
  AUTH_REQUIRED_CODE,
  AUTH_REQUIRED_MESSAGE,
  authErrorMessage,
  getCurrentUser,
  getSession,
  isAuthRequiredError,
  purgeLegacyLocalData,
  requireUserId,
  signIn,
  signInWithGoogle,
  signOut,
  signUp,
  subscribeToAuth,
  toAuthUser,
} from "@/lib/auth";

type FakeSupabaseUser = {
  id: string;
  email: string | null;
  user_metadata?: Record<string, unknown>;
};

function makeUser(overrides: Partial<FakeSupabaseUser> = {}): FakeSupabaseUser {
  return {
    id: "user-1",
    email: "person@example.com",
    user_metadata: {},
    ...overrides,
  };
}

function makeSession(user: FakeSupabaseUser = makeUser()) {
  return { access_token: "token", user };
}

function makeAuthClient(overrides: Partial<Record<string, unknown>> = {}) {
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    updateUser: vi.fn(),
    ...overrides,
  };
  return { from: vi.fn(), auth };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// toAuthUser
// ---------------------------------------------------------------------------
describe("toAuthUser", () => {
  it("maps id and email straight through", () => {
    const user = makeUser({ id: "abc-123", email: "a@b.com" });
    expect(toAuthUser(user as never)).toMatchObject({ id: "abc-123", email: "a@b.com" });
  });

  it("maps a null email through as null", () => {
    const user = makeUser({ email: null });
    expect(toAuthUser(user as never).email).toBeNull();
  });

  it("trims a valid, in-range nickname", () => {
    const user = makeUser({ user_metadata: { nickname: "  Kuya Ben  " } });
    expect(toAuthUser(user as never).nickname).toBe("Kuya Ben");
  });

  it("normalizes a missing nickname to ''", () => {
    const user = makeUser({ user_metadata: {} });
    expect(toAuthUser(user as never).nickname).toBe("");
  });

  it("normalizes a non-string nickname to ''", () => {
    const user = makeUser({ user_metadata: { nickname: 12345 } });
    expect(toAuthUser(user as never).nickname).toBe("");
  });

  it(`normalizes a nickname over MAX_NICKNAME_LENGTH (${MAX_NICKNAME_LENGTH}) to ''`, () => {
    const user = makeUser({ user_metadata: { nickname: "n".repeat(MAX_NICKNAME_LENGTH + 1) } });
    expect(toAuthUser(user as never).nickname).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getSession / getCurrentUser
// ---------------------------------------------------------------------------
describe("getSession / getCurrentUser", () => {
  it("getSession resolves null when there is no session", async () => {
    const client = makeAuthClient();
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(getSession()).resolves.toBeNull();
  });

  it("getSession resolves the session object when one exists", async () => {
    const session = makeSession();
    const client = makeAuthClient({
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(getSession()).resolves.toMatchObject({ access_token: "token" });
  });

  it("getCurrentUser resolves null when signed out", async () => {
    const client = makeAuthClient();
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("getCurrentUser resolves the mapped AuthUser when signed in", async () => {
    const session = makeSession(makeUser({ id: "user-9" }));
    const client = makeAuthClient({
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(getCurrentUser()).resolves.toMatchObject({ id: "user-9" });
  });
});

// ---------------------------------------------------------------------------
// requireUserId / isAuthRequiredError
// ---------------------------------------------------------------------------
describe("requireUserId", () => {
  it("throws a marked error with no session", async () => {
    const client = makeAuthClient();
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(requireUserId()).rejects.toThrow(AUTH_REQUIRED_MESSAGE);
  });

  it("the thrown error is recognized by isAuthRequiredError", async () => {
    const client = makeAuthClient();
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    let caught: unknown;
    try {
      await requireUserId();
    } catch (error) {
      caught = error;
    }

    expect(isAuthRequiredError(caught)).toBe(true);
    expect((caught as Error).cause).toMatchObject({ code: AUTH_REQUIRED_CODE });
  });

  it("resolves to the signed-in user's id when a session exists", async () => {
    const session = makeSession(makeUser({ id: "user-42" }));
    const client = makeAuthClient({
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(requireUserId()).resolves.toBe("user-42");
  });
});

describe("isAuthRequiredError", () => {
  it("returns false for an unrelated error", () => {
    expect(isAuthRequiredError(new Error("network down"))).toBe(false);
  });

  it("returns false for a non-Error value", () => {
    expect(isAuthRequiredError("nope")).toBe(false);
    expect(isAuthRequiredError(null)).toBe(false);
    expect(isAuthRequiredError(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// signUp
// ---------------------------------------------------------------------------
describe("signUp", () => {
  it("trims and lower-cases the email, leaves the password untouched", async () => {
    const signUpMock = vi.fn().mockResolvedValue({ data: { session: makeSession(), user: makeUser() }, error: null });
    const client = makeAuthClient({ signUp: signUpMock });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await signUp("  Foo@Example.COM  ", " p@ssword ");

    expect(signUpMock).toHaveBeenCalledWith({ email: "foo@example.com", password: " p@ssword " });
  });

  it("resolves needsEmailConfirmation: false when a session comes back", async () => {
    const client = makeAuthClient({
      signUp: vi.fn().mockResolvedValue({ data: { session: makeSession(), user: makeUser() }, error: null }),
    });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(signUp("a@b.com", "password1")).resolves.toEqual({ needsEmailConfirmation: false });
  });

  it("resolves needsEmailConfirmation: true when session is null", async () => {
    const client = makeAuthClient({
      signUp: vi.fn().mockResolvedValue({ data: { session: null, user: makeUser() }, error: null }),
    });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(signUp("a@b.com", "password1")).resolves.toEqual({ needsEmailConfirmation: true });
  });

  it("rejects with the raw AuthError when signUp fails", async () => {
    const authError = Object.assign(new Error("Weak password"), { code: "weak_password" });
    const client = makeAuthClient({
      signUp: vi.fn().mockResolvedValue({ data: { session: null, user: null }, error: authError }),
    });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(signUp("a@b.com", "weak")).rejects.toBe(authError);
  });
});

// ---------------------------------------------------------------------------
// signIn
// ---------------------------------------------------------------------------
describe("signIn", () => {
  it("trims and lower-cases the email, leaves the password byte-identical", async () => {
    const signInMock = vi.fn().mockResolvedValue({ error: null });
    const client = makeAuthClient({ signInWithPassword: signInMock });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await signIn(" Foo@Example.com", "  p@ss  ");

    expect(signInMock).toHaveBeenCalledWith({ email: "foo@example.com", password: "  p@ss  " });
  });

  it("resolves on success", async () => {
    const client = makeAuthClient({ signInWithPassword: vi.fn().mockResolvedValue({ error: null }) });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(signIn("a@b.com", "password1")).resolves.toBeUndefined();
  });

  it("rejects with the raw AuthError on failure", async () => {
    const authError = Object.assign(new Error("Invalid login credentials"), { code: "invalid_credentials" });
    const client = makeAuthClient({ signInWithPassword: vi.fn().mockResolvedValue({ error: authError }) });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(signIn("a@b.com", "wrong")).rejects.toBe(authError);
  });
});

// ---------------------------------------------------------------------------
// signInWithGoogle
// ---------------------------------------------------------------------------
describe("signInWithGoogle", () => {
  it("calls signInWithOAuth with provider google and an absolute redirectTo built from next", async () => {
    const signInWithOAuthMock = vi.fn().mockResolvedValue({ data: { provider: "google", url: "https://accounts.google.com/o" }, error: null });
    const client = makeAuthClient({ signInWithOAuth: signInWithOAuthMock });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await signInWithGoogle("/settings");

    expect(signInWithOAuthMock).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/settings` },
    });
  });

  it("resolves on success", async () => {
    const client = makeAuthClient({
      signInWithOAuth: vi.fn().mockResolvedValue({ data: { provider: "google", url: "https://accounts.google.com/o" }, error: null }),
    });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(signInWithGoogle("/")).resolves.toBeUndefined();
  });

  it("rejects with the raw AuthError on failure", async () => {
    const authError = Object.assign(new Error("Provider not enabled"), { code: "provider_disabled" });
    const client = makeAuthClient({
      signInWithOAuth: vi.fn().mockResolvedValue({ data: { provider: "google", url: null }, error: authError }),
    });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(signInWithGoogle("/")).rejects.toBe(authError);
  });
});

// ---------------------------------------------------------------------------
// signOut
// ---------------------------------------------------------------------------
describe("signOut", () => {
  it("calls signOut with the local-scope fallback", async () => {
    const signOutMock = vi.fn().mockResolvedValue({ error: null });
    const client = makeAuthClient({ signOut: signOutMock });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await signOut();

    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
  });

  it("still resolves when the network call rejects", async () => {
    const client = makeAuthClient({ signOut: vi.fn().mockRejectedValue(new Error("offline")) });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(signOut()).resolves.toBeUndefined();
  });

  it("still resolves when the client reports an error object (not a throw)", async () => {
    const client = makeAuthClient({ signOut: vi.fn().mockResolvedValue({ error: new Error("nope") }) });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(signOut()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// subscribeToAuth
// ---------------------------------------------------------------------------
describe("subscribeToAuth", () => {
  it("maps SIGNED_OUT (session null) to null", () => {
    const callback = vi.fn();
    let handler!: (event: string, session: unknown) => void;
    const client = makeAuthClient({
      onAuthStateChange: vi.fn((cb: typeof handler) => {
        handler = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    subscribeToAuth(callback);
    handler("SIGNED_OUT", null);

    expect(callback).toHaveBeenCalledWith(null);
  });

  it("maps a SIGNED_IN event with a session to the mapped AuthUser", () => {
    const callback = vi.fn();
    let handler!: (event: string, session: unknown) => void;
    const client = makeAuthClient({
      onAuthStateChange: vi.fn((cb: typeof handler) => {
        handler = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    subscribeToAuth(callback);
    handler("SIGNED_IN", makeSession(makeUser({ id: "user-7" })));

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: "user-7" }));
  });

  it("returns a working unsubscribe function", () => {
    const unsubscribe = vi.fn();
    const client = makeAuthClient({
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe } } }),
    });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    const stop = subscribeToAuth(vi.fn());
    stop();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// authErrorMessage
// ---------------------------------------------------------------------------
describe("authErrorMessage", () => {
  function codeError(code: string, extra: Record<string, unknown> = {}) {
    return Object.assign(new Error(code), { code, ...extra });
  }

  it("invalid_credentials -> the same message regardless of unknown-email vs wrong-password", () => {
    expect(authErrorMessage(codeError("invalid_credentials"), "signin")).toBe(
      "Email or password is incorrect.",
    );
  });

  it("email_not_confirmed", () => {
    expect(authErrorMessage(codeError("email_not_confirmed"), "signin")).toMatch(/confirm your email/i);
  });

  it("user_already_exists / email_exists in signup mode", () => {
    expect(authErrorMessage(codeError("user_already_exists"), "signup")).toMatch(/already has an account/i);
    expect(authErrorMessage(codeError("email_exists"), "signup")).toMatch(/already has an account/i);
  });

  it("weak_password includes MIN_PASSWORD_LENGTH and appends reasons when present", () => {
    const withReasons = authErrorMessage(
      codeError("weak_password", { reasons: ["Password should contain a number."] }),
      "signup",
    );
    expect(withReasons).toMatch(/8 characters/);
    expect(withReasons).toMatch(/contain a number/);

    const withoutReasons = authErrorMessage(codeError("weak_password", { reasons: [] }), "signup");
    expect(withoutReasons).toMatch(/8 characters/);
  });

  it("validation_failed / email_address_invalid", () => {
    expect(authErrorMessage(codeError("validation_failed"), "signup")).toMatch(/valid email/i);
    expect(authErrorMessage(codeError("email_address_invalid"), "signup")).toMatch(/valid email/i);
  });

  it("email_address_not_authorized", () => {
    expect(authErrorMessage(codeError("email_address_not_authorized"), "signup")).toMatch(/aren.t allowed/i);
  });

  it("signup_disabled", () => {
    expect(authErrorMessage(codeError("signup_disabled"), "signup")).toMatch(/sign-ups are closed/i);
  });

  it("rate limit codes and a bare 429 status all map to the same throttling copy", () => {
    expect(authErrorMessage(codeError("over_request_rate_limit"), "signin")).toMatch(/too many attempts/i);
    expect(authErrorMessage(codeError("over_email_send_rate_limit"), "signup")).toMatch(/too many attempts/i);
    expect(authErrorMessage({ status: 429, message: "rate limited" }, "signin")).toMatch(/too many attempts/i);
  });

  it("a bare TypeError (network failure) maps to a connectivity message", () => {
    expect(authErrorMessage(new TypeError("Failed to fetch"), "signin")).toMatch(/couldn.t reach the server/i);
  });

  it("falls back to a generic message and still surfaces the raw message text for an unrecognized error", () => {
    const result = authErrorMessage(new Error("Something bizarre happened"), "signin");
    expect(result).toMatch(/something went wrong/i);
    expect(result).toMatch(/something bizarre happened/i);
  });

  it("never returns an empty string", () => {
    expect(authErrorMessage(null, "signin")).not.toBe("");
    expect(authErrorMessage(undefined, "signup")).not.toBe("");
    expect(authErrorMessage("a plain string", "signin")).not.toBe("");
  });
});

// ---------------------------------------------------------------------------
// purgeLegacyLocalData
// ---------------------------------------------------------------------------
describe("purgeLegacyLocalData", () => {
  it("removes exactly the three legacy keys", () => {
    const removeItem = vi.fn();
    const originalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { removeItem },
    });

    purgeLegacyLocalData();

    expect(removeItem).toHaveBeenCalledWith("zpots:confirmer-id");
    expect(removeItem).toHaveBeenCalledWith("zpots:confirmed-spots");
    expect(removeItem).toHaveBeenCalledWith("zpots:nickname");
    expect(removeItem).toHaveBeenCalledTimes(3);

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalStorage,
    });
  });

  it("never throws when localStorage is missing", () => {
    const originalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: undefined,
    });

    expect(() => purgeLegacyLocalData()).not.toThrow();

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalStorage,
    });
  });

  it("never throws when localStorage access itself throws", () => {
    const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });

    expect(() => purgeLegacyLocalData()).not.toThrow();

    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  });
});

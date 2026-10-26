import type { Session, User } from "@supabase/supabase-js";

import { getSupabaseClient } from "@/lib/supabase";
import { MAX_NICKNAME_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/validation";

const LEGACY_CONFIRMER_ID_KEY = "zpots:confirmer-id"; // src/lib/local-identity.ts (deleted, D3)
const LEGACY_CONFIRMED_SPOTS_KEY = "zpots:confirmed-spots"; // src/lib/confirmed-spots-storage.ts (deleted, D3)
const LEGACY_NICKNAME_KEY = "zpots:nickname"; // src/lib/nickname-storage.ts (deleted, D5)

export type AuthStatus = "loading" | "signed-out" | "signed-in";

/** The only shape the rest of the app ever sees. Never leak supabase's `User`. */
export interface AuthUser {
  id: string;
  email: string | null;
  nickname: string;
}

export const AUTH_REQUIRED_CODE = "auth_required" as const;
export const AUTH_REQUIRED_MESSAGE = "Sign in to continue.";

/** Maps a supabase User -> AuthUser. nickname: trimmed string <= MAX_NICKNAME_LENGTH, else ''. */
export function toAuthUser(user: User): AuthUser {
  const rawNickname = user.user_metadata?.nickname;
  let nickname = "";

  if (typeof rawNickname === "string") {
    const trimmed = rawNickname.trim();
    if (trimmed.length > 0 && trimmed.length <= MAX_NICKNAME_LENGTH) {
      nickname = trimmed;
    }
  }

  return { id: user.id, email: user.email ?? null, nickname };
}

/** Local session read (no network). null when signed out. */
export async function getSession(): Promise<Session | null> {
  const client = getSupabaseClient();
  const { data } = await client.auth.getSession();
  return data.session ?? null;
}

/** Convenience: toAuthUser(session.user) or null. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await getSession();
  return session ? toAuthUser(session.user) : null;
}

/**
 * The uid for a write. Throws Error(AUTH_REQUIRED_MESSAGE, { cause: { code: AUTH_REQUIRED_CODE } })
 * when there is no session. Every repo write calls this FIRST, before any storage/network call.
 */
export async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) {
    throw new Error(AUTH_REQUIRED_MESSAGE, { cause: { code: AUTH_REQUIRED_CODE } });
  }
  return session.user.id;
}

/** true iff `error` is the throw above (checks cause.code === AUTH_REQUIRED_CODE). */
export function isAuthRequiredError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const cause = error.cause as { code?: unknown } | undefined;
  return cause?.code === AUTH_REQUIRED_CODE;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Rejects with the raw supabase AuthError (the page maps it via authErrorMessage). */
export async function signUp(
  email: string,
  password: string,
): Promise<{ needsEmailConfirmation: boolean }> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.signUp({
    email: normalizeEmail(email),
    password,
  });

  if (error) throw error;

  // Covers both a real "confirm your email" response and the obfuscated
  // existing-user response Supabase returns when confirmation is ON
  // (auth-migration.md section 2.5) -- the UI shows the same copy for both.
  return { needsEmailConfirmation: data.session === null };
}

export async function signIn(email: string, password: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });

  if (error) throw error;
}

/**
 * Kicks off the Google OAuth redirect. `next` is the same-origin relative
 * path to land back on once Supabase sends the browser back to this app
 * (the caller is expected to have already run it through the same
 * open-redirect guard the email/password flow uses). On success the browser
 * navigates away to Google before this promise settles; there is no session
 * yet to return -- detectSessionInUrl (src/lib/supabase.ts) is what picks up
 * the session once the redirect lands back here. Rejects with the raw
 * supabase AuthError (the page maps it via authErrorMessage), same as
 * signIn/signUp.
 */
export async function signInWithGoogle(next: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}${next}` },
  });

  if (error) throw error;
}

/**
 * Always clears the local session even if the network call fails --
 * `{ scope: 'local' }` so a dead network never leaves a user stuck signed
 * in on this device (auth-migration.md section 2.6).
 */
export async function signOut(): Promise<void> {
  try {
    await getSupabaseClient().auth.signOut({ scope: "local" });
  } catch {
    // Best-effort: the caller only needs the local session cleared, which
    // GoTrue already does before/without needing the network round trip.
  }
}

/** Wraps onAuthStateChange; callback gets the mapped user or null. Returns unsubscribe. */
export function subscribeToAuth(callback: (user: AuthUser | null) => void): () => void {
  const client = getSupabaseClient();
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((_event, session) => {
    callback(session ? toAuthUser(session.user) : null);
  });

  return () => subscription.unsubscribe();
}

/** section 2.4 table. mode affects only the user_already_exists copy. Never returns ''. */
export function authErrorMessage(error: unknown, mode: "signin" | "signup"): string {
  void mode; // Reserved for a future mode-specific variant of the user_already_exists copy.

  const code = (error as { code?: unknown } | null)?.code;
  const status = (error as { status?: unknown } | null)?.status;
  const rawMessage = (error as { message?: unknown } | null)?.message;
  const message = typeof rawMessage === "string" ? rawMessage : undefined;

  if (code === "invalid_credentials") {
    return "Email or password is incorrect.";
  }

  if (code === "email_not_confirmed") {
    return "Confirm your email first — check your inbox for the link.";
  }

  if (code === "user_already_exists" || code === "email_exists") {
    return "That email already has an account. Sign in instead.";
  }

  if (code === "weak_password") {
    const reasons = (error as { reasons?: unknown } | null)?.reasons;
    let text = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (Array.isArray(reasons) && reasons.length > 0) {
      text += ` ${reasons.join(" ")}`;
    }
    return text;
  }

  if (code === "validation_failed" || code === "email_address_invalid") {
    return "Enter a valid email address.";
  }

  if (code === "email_address_not_authorized") {
    return "Sign-ups from this email address aren't allowed right now.";
  }

  if (code === "signup_disabled") {
    return "Sign-ups are closed right now.";
  }

  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || status === 429) {
    return "Too many attempts. Wait a minute and try again.";
  }

  if (error instanceof TypeError) {
    return "Couldn't reach the server. Check your connection and try again.";
  }

  return message
    ? `Something went wrong. Please try again.\n${message}`
    : "Something went wrong. Please try again.";
}

/** Removes zpots:confirmer-id, zpots:confirmed-spots, zpots:nickname. Never throws. */
export function purgeLegacyLocalData(): void {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;

    storage.removeItem(LEGACY_CONFIRMER_ID_KEY);
    storage.removeItem(LEGACY_CONFIRMED_SPOTS_KEY);
    storage.removeItem(LEGACY_NICKNAME_KEY);
  } catch {
    // Storage unavailable, sandboxed iframe, or a throwing getter -- nothing
    // further to do; these are only best-effort legacy cleanup keys.
  }
}

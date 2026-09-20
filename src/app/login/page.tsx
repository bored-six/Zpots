"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";

import { useAuth } from "@/components/AuthProvider";
import ClipboardShell from "@/components/ClipboardShell";
import { GoogleGIcon } from "@/components/icons/brand-icons";
import { AlertIcon } from "@/components/icons/status-icons";
import { authErrorMessage, signIn, signInWithGoogle, signUp } from "@/lib/auth";
import { validateCredentials, type CredentialsMode } from "@/lib/validation";

const FIELD_LABEL_CLASS = "text-sm font-medium text-[#3a3730]";
const TEXT_INPUT_CLASS =
  "w-full rounded-sm border border-[#d8d4cb] bg-white px-3 py-2 text-sm text-[#1f2420] " +
  "placeholder:text-[#a9a498] focus:border-[var(--zpots-brass)] focus:outline-none focus:ring-2 " +
  "focus:ring-[var(--zpots-brass)]/25 disabled:cursor-not-allowed disabled:bg-[#f1efe9]";
const SUBMIT_BUTTON_CLASS =
  "rounded-sm bg-[var(--zpots-brass)] px-4 py-2 text-sm font-semibold text-white hover:brightness-90 " +
  "disabled:cursor-not-allowed disabled:bg-[#c9c6bd] disabled:text-[#6f6b60]";
const GOOGLE_BUTTON_CLASS =
  "flex w-full items-center justify-center gap-2 rounded-sm border border-[#d8d4cb] bg-white px-4 py-2 " +
  "text-sm font-semibold text-[#1f2420] hover:border-[var(--zpots-brass)] hover:bg-[#faf8f3] " +
  "disabled:cursor-not-allowed disabled:bg-[#f1efe9] disabled:text-[#a9a498]";
const RATE_LIMIT_COOLDOWN_MS = 30_000;

function ErrorBanner({ message }: { message: string }) {
  const [firstLine, ...rest] = message.split("\n");
  return (
    <div className="flex items-start gap-1.5 text-sm font-medium text-[#9a3324]">
      <AlertIcon className="mt-0.5 shrink-0" />
      <div>
        <p>{firstLine}</p>
        {rest.length > 0 && <p className="mt-0.5 text-xs font-normal">{rest.join("\n")}</p>}
      </div>
    </div>
  );
}

/**
 * Same-origin relative-path guard against an open redirect (auth-migration
 * section 1.2). Anything that isn't a single leading `/` with no scheme
 * marker or backslash falls back to `/`.
 */
function safeNextPath(rawNext: string | null): string {
  if (!rawNext) return "/";
  if (!rawNext.startsWith("/")) return "/";
  if (rawNext.startsWith("//")) return "/";
  if (rawNext.includes("\\")) return "/";

  const schemeIndex = rawNext.indexOf(":");
  const firstSlashAfterRoot = rawNext.indexOf("/", 1);
  if (schemeIndex !== -1 && (firstSlashAfterRoot === -1 || schemeIndex < firstSlashAfterRoot)) {
    return "/";
  }

  return rawNext;
}

function isUserAlreadyExistsError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "user_already_exists" || code === "email_exists";
}

function isRateLimitError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  const status = (error as { status?: unknown } | null)?.status;
  return code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || status === 429;
}

/**
 * useSearchParams() requires a Suspense boundary for the prerendered shell
 * (Next.js static-bailout rule) -- the fallback essentially never shows in
 * practice since this whole page is client-rendered anyway.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<ClipboardShell>{null}</ClipboardShell>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { status: authStatus } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const next = safeNextPath(searchParams.get("next"));
  const [mode, setMode] = useState<CredentialsMode>(
    searchParams.get("mode") === "signup" ? "signup" : "signin",
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [showSignInToggle, setShowSignInToggle] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const rateLimitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (authStatus === "signed-in") {
      router.replace(next);
    }
  }, [authStatus, next, router]);

  useEffect(() => {
    return () => {
      if (rateLimitTimeoutRef.current) clearTimeout(rateLimitTimeoutRef.current);
    };
  }, []);

  function toggleMode() {
    setMode((prev) => (prev === "signin" ? "signup" : "signin"));
    setError(null);
    setFieldErrors({});
    setShowSignInToggle(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || isRateLimited) return;

    setError(null);
    setShowSignInToggle(false);
    setFieldErrors({});

    const validation = validateCredentials(email, password, mode);
    if (!validation.valid) {
      setFieldErrors(validation.errors);
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "signup") {
        const result = await signUp(email, password);
        if (result.needsEmailConfirmation) {
          setNeedsEmailConfirmation(true);
        } else {
          router.replace(next);
        }
      } else {
        await signIn(email, password);
        router.replace(next);
      }
    } catch (caught) {
      // A race with another tab may have already produced a session by the
      // time this rejects -- don't show a stale error over a real sign-in.
      if (authStatus === "signed-in") return;

      setError(authErrorMessage(caught, mode));
      if (isUserAlreadyExistsError(caught) && mode === "signup") {
        setShowSignInToggle(true);
      }
      if (isRateLimitError(caught)) {
        setIsRateLimited(true);
        rateLimitTimeoutRef.current = setTimeout(() => {
          setIsRateLimited(false);
        }, RATE_LIMIT_COOLDOWN_MS);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    if (isGoogleLoading) return;

    setError(null);
    setShowSignInToggle(false);
    setIsGoogleLoading(true);
    try {
      // On success the browser is about to navigate to Google, so this
      // component stays "loading" until it unmounts -- there is nothing
      // else to update on the happy path.
      await signInWithGoogle(next);
    } catch (caught) {
      if (authStatus === "signed-in") return;

      setError(authErrorMessage(caught, "signin"));
      setIsGoogleLoading(false);
    }
  }

  const isFormDisabled = authStatus === "loading" || authStatus === "signed-in" || isSubmitting;
  const isSubmitDisabled = isFormDisabled || isRateLimited;
  const isGoogleButtonDisabled = isFormDisabled || isGoogleLoading;

  if (authStatus === "signed-in") {
    return (
      <ClipboardShell>
        <p className="text-sm text-[var(--zpots-ink)]/70">Taking you back…</p>
      </ClipboardShell>
    );
  }

  return (
    <ClipboardShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1
            className="text-xl font-semibold text-[var(--zpots-navy)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {mode === "signup" ? "Create an account" : "Sign in"}
          </h1>
        </div>

        {needsEmailConfirmation ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[var(--zpots-ink)]/70">
              Check your inbox — we sent a confirmation link to <strong>{email}</strong>. Come
              back and sign in once you&rsquo;ve confirmed.
            </p>
            <button
              type="button"
              onClick={() => {
                setNeedsEmailConfirmation(false);
                setMode("signin");
              }}
              className="w-fit text-sm font-semibold text-[var(--zpots-navy)] underline underline-offset-2"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {error && (
              <div className="flex flex-col gap-2">
                <ErrorBanner message={error} />
                {showSignInToggle && (
                  <button
                    type="button"
                    onClick={toggleMode}
                    className="w-fit text-sm font-semibold text-[var(--zpots-navy)] underline underline-offset-2"
                  >
                    Sign in instead
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleButtonDisabled}
              className={GOOGLE_BUTTON_CLASS}
            >
              <GoogleGIcon />
              {isGoogleLoading ? "Redirecting…" : "Continue with Google"}
            </button>

            <div className="flex items-center gap-3" role="separator" aria-hidden="true">
              <div className="h-px flex-1 bg-[#d8d4cb]" />
              <span className="text-xs font-medium uppercase tracking-wide text-[#8a8579]">or</span>
              <div className="h-px flex-1 bg-[#d8d4cb]" />
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-email" className={FIELD_LABEL_CLASS}>
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                disabled={isFormDisabled}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                className={TEXT_INPUT_CLASS}
              />
              {fieldErrors.email && (
                <p className="text-sm font-medium text-[#9a3324]">{fieldErrors.email}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-password" className={FIELD_LABEL_CLASS}>
                Password
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                disabled={isFormDisabled}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                className={TEXT_INPUT_CLASS}
              />
              {fieldErrors.password && (
                <p className="text-sm font-medium text-[#9a3324]">{fieldErrors.password}</p>
              )}
              {mode === "signup" && (
                <p className="text-xs text-[#8a8579]">
                  Pick something you&rsquo;ll remember — password reset isn&rsquo;t available yet.
                </p>
              )}
            </div>

            <div className="mt-1 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={toggleMode}
                className="text-sm font-medium text-[var(--zpots-navy)] underline underline-offset-2"
              >
                {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
              </button>

              <button type="submit" disabled={isSubmitDisabled} className={SUBMIT_BUTTON_CLASS}>
                {isSubmitting
                  ? mode === "signup"
                    ? "Creating account…"
                    : "Signing in…"
                  : mode === "signup"
                    ? "Create account"
                    : "Sign in"}
              </button>
            </div>
            </form>
          </div>
        )}
      </div>
    </ClipboardShell>
  );
}

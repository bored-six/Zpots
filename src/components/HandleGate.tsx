"use client";

import { useEffect, useId, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import Bilingual from "@/components/Bilingual";
import { COPY } from "@/lib/copy";
import { getMyProfile, isHandleAvailable, updateHandle } from "@/lib/profiles-repo";

/** Mirrors `profiles_handle_format` in 0004_social_spots.sql. */
const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
const DEBOUNCE_MS = 300;
const SESSION_SKIP_KEY = "zpots:handle-gate-skipped";

type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

// Mirrors SignInPrompt's overlay/card language so the handle nudge reads as
// one system with the other in-app gate, per the file-ownership spec.
const OVERLAY_CLASS = "fixed inset-0 z-[1200] flex items-center justify-center bg-tinta/55 p-4";
const CARD_CLASS =
  "zpots-shadow flex w-full max-w-sm flex-col gap-4 rounded border border-stone bg-cream p-5";
const FIELD_LABEL_CLASS = "text-xs font-bold uppercase tracking-[0.12em] text-stone-deep";
const INPUT_CLASS =
  "min-h-11 w-full rounded border border-stone bg-cream px-3 py-2 text-sm text-ink focus:outline-none";

/**
 * Mounted once in layout.tsx. Reads the caller's own profile once per
 * sign-in; if `needsHandle`, nags with a modal until a handle is picked or
 * skipped. The skip is scoped to `sessionStorage` so it nags again next
 * session but never twice in the same one.
 */
export default function HandleGate() {
  const { status } = useAuth();
  const [needsHandle, setNeedsHandle] = useState(false);
  const [handle, setHandle] = useState("");
  const [availability, setAvailability] = useState<Availability>("idle");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasCheckedProfile = useRef(false);

  useEffect(() => {
    if (status !== "signed-in" || hasCheckedProfile.current) return;
    hasCheckedProfile.current = true;

    if (window.sessionStorage.getItem(SESSION_SKIP_KEY)) return;

    getMyProfile().then((profile) => {
      if (profile?.needsHandle) setNeedsHandle(true);
    });
  }, [status]);

  useEffect(() => {
    if (!needsHandle) return;
    headingRef.current?.focus();
  }, [needsHandle]);

  const normalizedHandle = handle.trim().toLowerCase();
  const isValidFormat = HANDLE_PATTERN.test(normalizedHandle);
  // "idle" and "invalid" are pure functions of `handle` -- computed here at
  // render time rather than pushed into `availability` via an effect, so
  // the effect below only ever calls setState right before it also starts
  // the actual external operation (the debounce timer / network check).
  const displayAvailability: Availability = !normalizedHandle
    ? "idle"
    : !isValidFormat
      ? "invalid"
      : availability;

  // Kicking off the debounced availability check is itself the external
  // operation this effect synchronizes with (same pattern/justification as
  // SpotMap.tsx's sign-out effect): "checking" has to be set synchronously
  // so the UI reflects "in flight" for the full debounce window, not just
  // once the network call resolves.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const normalized = handle.trim().toLowerCase();
    if (!normalized || !HANDLE_PATTERN.test(normalized)) return;

    setAvailability("checking");
    const timer = setTimeout(() => {
      isHandleAvailable(normalized).then((available) => {
        setAvailability(available ? "available" : "taken");
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [handle]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSkip() {
    window.sessionStorage.setItem(SESSION_SKIP_KEY, "1");
    setNeedsHandle(false);
  }

  async function handleSave() {
    if (displayAvailability !== "available" || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      await updateHandle(handle.trim().toLowerCase());
      setNeedsHandle(false);
    } catch {
      setSaveError(COPY.handleTaken.en);
    } finally {
      setSaving(false);
    }
  }

  if (!needsHandle) return null;

  return (
    <div className={OVERLAY_CLASS}>
      <div role="dialog" aria-modal="true" aria-labelledby={headingId} className={CARD_CLASS}>
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-bold text-ink focus:outline-none"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <Bilingual k="pickHandle" />
        </h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="handle-gate-input" className={FIELD_LABEL_CLASS}>
            Handle
          </label>
          <input
            id="handle-gate-input"
            type="text"
            value={handle}
            autoComplete="off"
            onChange={(event) => setHandle(event.target.value)}
            className={INPUT_CLASS}
          />
          {displayAvailability === "checking" && (
            <p className="text-xs text-stone-deep">
              <Bilingual k="loading" />
            </p>
          )}
          {displayAvailability === "taken" && (
            <p className="text-xs text-cardinal">
              <Bilingual k="handleTaken" />
            </p>
          )}
          {displayAvailability === "invalid" && (
            <p className="text-xs text-cardinal">3-20 lowercase letters, numbers, or underscores.</p>
          )}
          {displayAvailability === "available" && (
            <p className="text-xs text-teal">{handle.trim().toLowerCase()} is available.</p>
          )}
          {saveError && <p className="text-xs text-cardinal">{saveError}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={displayAvailability !== "available" || saving}
            className="inline-flex min-h-10 items-center justify-center rounded bg-terracotta px-4 py-2 text-sm font-bold text-cream transition hover:bg-terracotta-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Bilingual k="save" tone="inherit" />
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="text-sm font-medium text-stone-deep hover:text-ink"
          >
            <Bilingual k="cancel" />
          </button>
        </div>
      </div>
    </div>
  );
}

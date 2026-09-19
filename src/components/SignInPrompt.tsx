"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";

import { SignInIcon } from "@/components/icons/action-icons";

export type GatedAction = "add" | "confirm" | "report";

interface SignInPromptProps {
  action: GatedAction;
  onDismiss: () => void;
}

// Mirrors SpotMap's OVERLAY_CLASS/CARD_CLASS (same z-index, same dimmed
// backdrop + parchment card language as the add-spot form) so this prompt
// reads as one system with it, per auth-migration.md section 3.3.
const OVERLAY_CLASS =
  "absolute inset-0 z-[1100] flex items-center justify-center bg-[#1f2420]/40 p-4";
const CARD_CLASS =
  "flex max-h-full w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-sm bg-white p-5 shadow-xl";

const COPY: Record<GatedAction, { heading: string; body: string }> = {
  add: {
    heading: "Sign in to add a spot",
    body: "Pins are tied to an account so people can trust what's on the map.",
  },
  confirm: {
    heading: "Sign in to confirm",
    body: "One confirmation per person — that's what makes Confirmed mean something.",
  },
  report: {
    heading: "Sign in to report",
    body: "Reports are a signal for a human to look at, not an instant delete.",
  },
};

/**
 * In-map "sign in to continue" gate (D7): shown instead of an immediate
 * redirect, so a user mid-gesture on the map gets a one-sentence
 * explanation and an exit rather than being yanked to a form.
 */
export default function SignInPrompt({ action, onDismiss }: SignInPromptProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const copy = COPY[action];

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss]);

  return (
    <div className={OVERLAY_CLASS} onClick={onDismiss}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={CARD_CLASS}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-[var(--zpots-navy)]">
          <SignInIcon />
          <h2
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className="text-lg font-semibold text-[var(--zpots-navy)] focus:outline-none"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {copy.heading}
          </h2>
        </div>

        <p className="text-sm text-[#3a3730]">{copy.body}</p>

        <div className="mt-1 flex flex-col gap-2">
          <Link
            href="/login?next=/"
            className="inline-flex items-center justify-center rounded-sm bg-[var(--zpots-brass)] px-4 py-2 text-sm font-semibold text-white hover:brightness-90"
          >
            Sign in
          </Link>
          <Link
            href="/login?mode=signup&next=/"
            className="inline-flex items-center justify-center rounded-sm border border-[var(--zpots-navy)]/20 px-4 py-2 text-sm font-semibold text-[var(--zpots-navy)] hover:bg-[var(--zpots-navy)]/5"
          >
            Create an account
          </Link>
          <button
            type="button"
            onClick={onDismiss}
            className="mt-1 text-sm font-medium text-[#8a8579] hover:text-[#3a3730]"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

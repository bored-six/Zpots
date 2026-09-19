import type { ReactNode } from "react";
import Link from "next/link";

import { SettingsCompassIcon } from "@/components/icons/action-icons";
import { AzulejoBand, BinderClip } from "@/components/icons/ornaments";

interface ClipboardShellProps {
  children: ReactNode;
  /**
   * Full-bleed mode: content fills the remaining viewport height below the
   * header (the map page). Defaults to false: a centered parchment card
   * that grows with its content (the Settings page).
   */
  fullBleed?: boolean;
}

const HEADER_CLASS =
  "relative flex items-start justify-between gap-4 bg-[var(--zpots-parchment)] px-5 py-5 sm:px-9 sm:py-6";

/**
 * Shared navy-board + brass-clip + parchment-sheet + azulejo-band chrome
 * for both the map page and the Settings page, so neither duplicates this
 * markup. Wraps its children additively -- it does not know or care what
 * they render.
 */
export default function ClipboardShell({ children, fullBleed = false }: ClipboardShellProps) {
  return (
    <div
      className={
        fullBleed
          ? "flex h-screen w-screen flex-col overflow-hidden bg-[var(--zpots-navy)]"
          : "min-h-screen w-full bg-[var(--zpots-navy)] px-4 py-8 sm:py-12"
      }
    >
      <div
        className={
          fullBleed
            ? "relative flex flex-1 min-h-0 flex-col"
            : "relative mx-auto flex w-full max-w-3xl flex-col rounded-sm shadow-2xl"
        }
      >
        <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2">
          <BinderClip size={60} />
        </div>

        <header className={HEADER_CLASS}>
          <div>
            <p
              className="text-2xl font-semibold tracking-wide text-[var(--zpots-navy)] sm:text-3xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Zpots
            </p>
            <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--zpots-pewter)] sm:text-xs">
              Mindanao, charted by locals
            </p>
            <p
              className="mt-1 text-base italic text-[var(--zpots-terracotta)] sm:text-lg"
              style={{ fontFamily: "var(--font-tagline)" }}
            >
              Ciudad Latina de Asia
            </p>
          </div>

          <Link
            href="/settings"
            aria-label="Settings"
            className="mt-1 inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--zpots-navy)]/20 p-2 text-[var(--zpots-navy)] transition hover:bg-[var(--zpots-navy)]/10 focus:outline-none focus:ring-2 focus:ring-[var(--zpots-navy)]/30"
          >
            <SettingsCompassIcon />
          </Link>
        </header>

        <AzulejoBand className="block w-full" height={12} />

        {fullBleed ? (
          <div className="relative min-h-0 flex-1">{children}</div>
        ) : (
          <div className="bg-[var(--zpots-parchment)] px-5 py-6 sm:px-9 sm:py-8">{children}</div>
        )}
      </div>
    </div>
  );
}

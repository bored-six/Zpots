"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { useAuth } from "@/components/AuthProvider";
import { SettingsCompassIcon } from "@/components/icons/action-icons";
import { AzulejoBand, StoneArch, VintaRule } from "@/components/icons/ornaments";
import { COPY } from "@/lib/copy";

interface ClipboardShellProps {
  children: ReactNode;
  /**
   * Full-bleed mode: content fills the remaining viewport height below the
   * header (the map page). Defaults to false: a centered card that grows
   * with its content (the Settings page).
   */
  fullBleed?: boolean;
}

const HEADER_CLASS =
  "relative flex items-start justify-between gap-4 bg-cream-deep px-5 py-3 sm:px-9 sm:py-6";

/**
 * Shared plaza / stone-wall chrome for both the map page and the Settings
 * page, so neither duplicates this markup: a thin AzulejoBand along the
 * very top, the header band itself, then a StoneArch + VintaRule as the
 * header's bottom edge. Wraps its children additively -- it does not know
 * or care what they render.
 */
export default function ClipboardShell({ children, fullBleed = false }: ClipboardShellProps) {
  const { status } = useAuth();

  return (
    <div
      className={
        fullBleed
          ? "flex h-screen w-screen flex-col overflow-hidden bg-cream"
          : "min-h-screen w-full bg-cream px-4 py-8 sm:py-12"
      }
    >
      <div
        className={
          fullBleed
            ? "relative flex flex-1 min-h-0 flex-col"
            : "zpots-shadow relative mx-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-[6px] border border-stone"
        }
      >
        <AzulejoBand className="block w-full" height={12} />

        <header className={HEADER_CLASS}>
          <div>
            <p
              className="text-2xl tracking-wide text-ink sm:text-[28px]"
              style={{ fontFamily: "var(--font-wordmark)" }}
            >
              Zpots
            </p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.2em] text-terracotta sm:text-xs">
              Ciudad de Zamboanga
            </p>
            <p
              className="mt-1 text-base italic text-stone-deep sm:text-lg"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {/* English secondary drops to its own line below `sm` -- at
                  375px wide, keeping it inline with the Chavacano primary
                  wrapped the tagline across 2-3 lines and blew the header
                  past 300px tall (fix round 1, spec item B4). */}
              <span aria-hidden="true">{COPY.tagline.cv}</span>
              <span className="block text-[12px] text-stone-deep sm:inline sm:text-[0.7em]">
                {" "}
                {COPY.tagline.en}
              </span>
            </p>
          </div>

          <div className="mt-1 flex shrink-0 items-center gap-3">
            {status === "signed-out" && (
              <Link
                href="/login"
                className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-ink underline underline-offset-4 hover:text-terracotta sm:text-xs"
              >
                Sign in
              </Link>
            )}
            <Link
              href="/settings"
              aria-label="Settings"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone text-ink transition hover:bg-cream-deep"
            >
              <SettingsCompassIcon />
            </Link>
          </div>
        </header>

        <StoneArch className="block w-full" height={8} />
        <VintaRule />

        {fullBleed ? (
          <div className="relative min-h-0 flex-1">{children}</div>
        ) : (
          <div className="bg-cream px-5 py-6 sm:px-9 sm:py-8">{children}</div>
        )}
      </div>
    </div>
  );
}

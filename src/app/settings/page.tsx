"use client";

import Link from "next/link";
import { useState } from "react";

import ClipboardShell from "@/components/ClipboardShell";
import { Flourish } from "@/components/icons/ornaments";
import { getLocallyConfirmedSpotIds } from "@/lib/confirmed-spots-storage";
import { clearAllLocalData } from "@/lib/local-data-reset";
import {
  MAX_STORED_NICKNAME_LENGTH,
  getStoredNickname,
  setStoredNickname,
} from "@/lib/nickname-storage";

const FIELD_LABEL_CLASS =
  "text-xs font-semibold uppercase tracking-[0.12em] text-[var(--zpots-pewter)]";
const INPUT_CLASS =
  "w-full rounded-sm border border-[var(--zpots-navy)]/20 bg-white px-3 py-2 text-sm text-[var(--zpots-ink)] " +
  "focus:border-[var(--zpots-brass)] focus:outline-none focus:ring-2 focus:ring-[var(--zpots-brass)]/30";
const SECTION_HEADING_CLASS =
  "text-sm font-semibold uppercase tracking-[0.12em] text-[var(--zpots-navy)]";
const CLEAR_BUTTON_CLASS =
  "inline-flex items-center gap-2 rounded-sm border border-[var(--zpots-cardinal)] px-4 py-2 text-sm " +
  "font-semibold text-[var(--zpots-cardinal)] transition hover:bg-[var(--zpots-cardinal)] hover:text-white";

/**
 * "Clear my local data" is deliberately window.confirm-gated (not a
 * two-click custom modal): this only touches this browser's own local
 * bookkeeping (nickname, confirmed-spots set, confirmer id) -- nothing on
 * the server -- so the plain native confirm is proportionate to the
 * stakes, per settings-page.test.tsx's frozen contract.
 */
export default function SettingsPage() {
  const [nickname, setNickname] = useState(() => getStoredNickname());
  const [confirmedCount, setConfirmedCount] = useState(
    () => getLocallyConfirmedSpotIds().size,
  );

  function handleNicknameBlur() {
    const trimmed = nickname.trim();
    setStoredNickname(trimmed);
    setNickname(trimmed);
  }

  function handleClearLocalData() {
    const confirmed = window.confirm(
      "Clear all local data on this device? This forgets your nickname and every spot you've confirmed. This cannot be undone.",
    );
    if (!confirmed) return;

    clearAllLocalData();
    setNickname(getStoredNickname());
    setConfirmedCount(getLocallyConfirmedSpotIds().size);
  }

  return (
    <ClipboardShell>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-xl font-semibold text-[var(--zpots-navy)]" style={{ fontFamily: "var(--font-display)" }}>
            Settings
          </h1>
          <p className="mt-1 text-sm text-[var(--zpots-ink)]/70">
            Zpots has no accounts -- everything here lives only on this device.
          </p>
        </div>

        <Flourish />

        <section className="flex flex-col gap-2">
          <h2 className={SECTION_HEADING_CLASS}>Nickname</h2>
          <p className="text-sm text-[var(--zpots-ink)]/70">
            Optional and purely cosmetic -- never a verified identity, just a
            byline other people can see on spots you&rsquo;ve added.
          </p>
          <label htmlFor="nickname" className={FIELD_LABEL_CLASS}>
            Nickname
          </label>
          <input
            id="nickname"
            type="text"
            value={nickname}
            maxLength={MAX_STORED_NICKNAME_LENGTH}
            onChange={(e) => setNickname(e.target.value)}
            onBlur={handleNicknameBlur}
            className={INPUT_CLASS}
            placeholder="e.g. Kuya Ben"
          />
        </section>

        <Flourish />

        <section className="flex flex-col gap-2">
          <h2 className={SECTION_HEADING_CLASS}>Your confirmations</h2>
          <p className="text-sm text-[var(--zpots-ink)]/70">
            You&rsquo;ve confirmed <span className="font-semibold text-[var(--zpots-navy)]">{confirmedCount}</span>{" "}
            {confirmedCount === 1 ? "spot" : "spots"} from this device.
          </p>
        </section>

        <Flourish />

        <section className="flex flex-col gap-3">
          <h2 className={SECTION_HEADING_CLASS}>Clear my local data</h2>
          <p className="text-sm text-[var(--zpots-ink)]/70">
            Forgets your nickname, your confirmed-spots history, and this
            device&rsquo;s local id. Spots and confirmations already sent to
            the server are not affected.
          </p>
          <button type="button" onClick={handleClearLocalData} className={CLEAR_BUTTON_CLASS}>
            Clear my local data
          </button>
        </section>

        <Flourish />

        <div className="flex flex-col gap-2 text-sm text-[var(--zpots-ink)]/70">
          <p>
            Map tiles &copy;{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-[var(--zpots-navy)]"
            >
              OpenStreetMap
            </a>{" "}
            contributors
          </p>
          <Link
            href="/"
            className="mt-2 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-[var(--zpots-navy)] underline underline-offset-2 hover:text-[var(--zpots-terracotta)]"
          >
            &larr; Back home
          </Link>
        </div>
      </div>
    </ClipboardShell>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import ClipboardShell from "@/components/ClipboardShell";
import { Flourish } from "@/components/icons/ornaments";
import { updateNickname, type AuthUser } from "@/lib/auth";
import { fetchMyConfirmedSpotIds } from "@/lib/spots-repo";
import { MAX_NICKNAME_LENGTH } from "@/lib/validation";

const FIELD_LABEL_CLASS =
  "text-xs font-semibold uppercase tracking-[0.12em] text-[var(--zpots-pewter)]";
const INPUT_CLASS =
  "w-full rounded-sm border border-[var(--zpots-navy)]/20 bg-white px-3 py-2 text-sm text-[var(--zpots-ink)] " +
  "focus:border-[var(--zpots-brass)] focus:outline-none focus:ring-2 focus:ring-[var(--zpots-brass)]/30";
const SECTION_HEADING_CLASS =
  "text-sm font-semibold uppercase tracking-[0.12em] text-[var(--zpots-navy)]";
const SIGN_OUT_BUTTON_CLASS =
  "inline-flex items-center gap-2 rounded-sm border border-[var(--zpots-cardinal)] px-4 py-2 text-sm " +
  "font-semibold text-[var(--zpots-cardinal)] transition hover:bg-[var(--zpots-cardinal)] hover:text-white";

function Attribution() {
  return (
    <p className="text-sm text-[var(--zpots-ink)]/70">
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
  );
}

function BackHomeLink() {
  return (
    <Link
      href="/"
      className="mt-2 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-[var(--zpots-navy)] underline underline-offset-2 hover:text-[var(--zpots-terracotta)]"
    >
      &larr; Back home
    </Link>
  );
}

function LoadingView() {
  return (
    <div className="flex flex-col gap-2">
      <h1
        className="text-xl font-semibold text-[var(--zpots-navy)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Settings
      </h1>
      <p className="text-sm text-[var(--zpots-ink)]/70">Loading your account…</p>
    </div>
  );
}

function SignedOutView() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-xl font-semibold text-[var(--zpots-navy)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Settings
        </h1>
        <p className="mt-1 text-sm text-[var(--zpots-ink)]/70">
          Sign in to set a nickname and see the spots you&rsquo;ve confirmed.
        </p>
        <Link
          href="/login?next=/settings"
          className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-sm bg-[var(--zpots-brass)] px-4 py-2 text-sm font-semibold text-white hover:brightness-90"
        >
          Sign in
        </Link>
      </div>

      <Flourish />

      <div className="flex flex-col gap-2">
        <Attribution />
        <BackHomeLink />
      </div>
    </div>
  );
}

function SignedInView({ user, signOut }: { user: AuthUser; signOut: () => Promise<void> }) {
  const router = useRouter();

  const [nickname, setNickname] = useState(user.nickname);
  const [lastSavedNickname, setLastSavedNickname] = useState(user.nickname);
  const [nicknameStatus, setNicknameStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [confirmedCount, setConfirmedCount] = useState<number | "—">(0);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetchMyConfirmedSpotIds()
      .then((ids) => {
        if (isMounted) setConfirmedCount(ids.size);
      })
      .catch(() => {
        if (isMounted) setConfirmedCount("—");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleNicknameBlur() {
    const trimmed = nickname.trim();
    if (trimmed === lastSavedNickname) return;

    setNicknameStatus("saving");
    try {
      await updateNickname(trimmed);
      setNickname(trimmed);
      setLastSavedNickname(trimmed);
      setNicknameStatus("saved");
    } catch {
      setNicknameStatus("error");
    }
  }

  async function handleSignOut() {
    setSignOutError(null);
    try {
      await signOut();
    } catch {
      setSignOutError("Couldn't reach the server, but you're signed out on this device.");
    }
    router.replace("/");
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-xl font-semibold text-[var(--zpots-navy)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Settings
        </h1>
      </div>

      <Flourish />

      <section className="flex flex-col gap-2">
        <h2 className={SECTION_HEADING_CLASS}>Account</h2>
        <p className="text-sm text-[var(--zpots-ink)]/70">{user.email}</p>
        {signOutError && (
          <p className="text-xs text-[var(--zpots-cardinal)]">{signOutError}</p>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          className={`${SIGN_OUT_BUTTON_CLASS} w-fit`}
        >
          Sign out
        </button>
      </section>

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
          maxLength={MAX_NICKNAME_LENGTH}
          onChange={(e) => {
            setNickname(e.target.value);
            setNicknameStatus("idle");
          }}
          onBlur={handleNicknameBlur}
          className={INPUT_CLASS}
          placeholder="e.g. Kuya Ben"
        />
        {nicknameStatus === "saving" && (
          <p className="text-xs text-[var(--zpots-pewter)]">Saving…</p>
        )}
        {nicknameStatus === "saved" && (
          <p className="text-xs text-[var(--zpots-pewter)]">Saved.</p>
        )}
        {nicknameStatus === "error" && (
          <p className="text-xs text-[var(--zpots-cardinal)]">
            Couldn&rsquo;t save your nickname. Try again.
          </p>
        )}
      </section>

      <Flourish />

      <section className="flex flex-col gap-2">
        <h2 className={SECTION_HEADING_CLASS}>Your confirmations</h2>
        <p className="text-sm text-[var(--zpots-ink)]/70">
          You&rsquo;ve confirmed{" "}
          <span className="font-semibold text-[var(--zpots-navy)]">{confirmedCount}</span>{" "}
          {confirmedCount === 1 ? "spot" : "spots"}.
        </p>
      </section>

      <Flourish />

      <div className="flex flex-col gap-2">
        <Attribution />
        <BackHomeLink />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { status, user, signOut } = useAuth();

  return (
    <ClipboardShell>
      {status === "loading" && <LoadingView />}
      {status === "signed-out" && <SignedOutView />}
      {status === "signed-in" && user && <SignedInView user={user} signOut={signOut} />}
    </ClipboardShell>
  );
}

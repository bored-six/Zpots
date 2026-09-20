"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import ClipboardShell from "@/components/ClipboardShell";
import { updateNickname, type AuthUser } from "@/lib/auth";
import { fetchMyConfirmedSpotIds } from "@/lib/spots-repo";
import { MAX_NICKNAME_LENGTH } from "@/lib/validation";

const FIELD_LABEL_CLASS =
  "text-xs font-bold uppercase tracking-[0.12em] text-stone-deep";
const INPUT_CLASS =
  "w-full min-h-11 rounded border border-stone bg-cream px-3 py-2 text-sm text-ink " +
  "focus:outline-none";
const SECTION_HEADING_CLASS =
  "text-xs font-bold uppercase tracking-[0.12em] text-stone-deep";
const SIGN_OUT_BUTTON_CLASS =
  "inline-flex min-h-10 items-center gap-2 rounded border border-cardinal px-4 py-2 text-sm " +
  "font-bold text-cardinal transition hover:bg-cardinal hover:text-cream";
// A plain 1px stone hairline divides settings sections (spec Task 4,
// "Settings page"). AzulejoBand can't do this: its tile pattern needs at
// least 12px of height to show a full diamond, so a 1px band just clips
// it down to an unrecognizable sliver (see ornaments.tsx AzulejoBand doc).
function SectionDivider() {
  return <div className="w-full border-t border-stone" />;
}

function Attribution() {
  return (
    <p className="text-sm text-ink/70">
      Map tiles &copy;{" "}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="underline hover:text-ink"
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
      className="mt-2 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-ink underline underline-offset-2 hover:text-terracotta"
    >
      &larr; Back home
    </Link>
  );
}

function LoadingView() {
  return (
    <div className="flex flex-col gap-2">
      <h1
        className="text-xl font-semibold text-ink"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Settings
      </h1>
      <p className="text-sm text-ink/70">Loading your account…</p>
    </div>
  );
}

function SignedOutView() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-xl font-semibold text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Settings
        </h1>
        <p className="mt-1 text-sm text-ink/70">
          Sign in to set a nickname and see the spots you&rsquo;ve confirmed.
        </p>
        <Link
          href="/login?next=/settings"
          className="mt-3 inline-flex w-fit items-center gap-1.5 rounded bg-terracotta px-4 py-2 text-sm font-bold text-cream hover:bg-terracotta-deep"
        >
          Sign in
        </Link>
      </div>

      <SectionDivider />

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
          className="text-xl font-semibold text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Settings
        </h1>
      </div>

      <SectionDivider />

      <section className="flex flex-col gap-2">
        <h2 className={SECTION_HEADING_CLASS}>Account</h2>
        <p className="text-sm text-ink/70">{user.email}</p>
        {signOutError && (
          <p className="text-xs text-cardinal">{signOutError}</p>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          className={`${SIGN_OUT_BUTTON_CLASS} w-fit`}
        >
          Sign out
        </button>
      </section>

      <SectionDivider />

      <section className="flex flex-col gap-2">
        <h2 className={SECTION_HEADING_CLASS}>Nickname</h2>
        <p className="text-sm text-ink/70">
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
          <p className="text-xs text-stone-deep">Saving…</p>
        )}
        {nicknameStatus === "saved" && (
          <p className="text-xs text-stone-deep">Saved.</p>
        )}
        {nicknameStatus === "error" && (
          <p className="text-xs text-cardinal">
            Couldn&rsquo;t save your nickname. Try again.
          </p>
        )}
      </section>

      <SectionDivider />

      <section className="flex flex-col gap-2">
        <h2 className={SECTION_HEADING_CLASS}>Your confirmations</h2>
        <p className="text-sm text-ink/70">
          You&rsquo;ve confirmed{" "}
          <span className="font-semibold text-ink">{confirmedCount}</span>{" "}
          {confirmedCount === 1 ? "spot" : "spots"}.
        </p>
      </section>

      <SectionDivider />

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

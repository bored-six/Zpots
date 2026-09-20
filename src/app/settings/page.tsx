"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent } from "react";

import Avatar from "@/components/Avatar";
import { useAuth } from "@/components/AuthProvider";
import ClipboardShell from "@/components/ClipboardShell";
import { updateNickname, type AuthUser } from "@/lib/auth";
import type { Profile } from "@/lib/profiles";
import {
  getMyProfile,
  isHandleAvailable,
  updateAvatarUrl,
  updateDisplayName,
  updateHandle,
  uploadAvatar,
} from "@/lib/profiles-repo";
import { fetchMyConfirmedSpotIds } from "@/lib/spots-repo";
import { MAX_NICKNAME_LENGTH } from "@/lib/validation";

/** Mirrors `profiles_handle_format` in 0004_social_spots.sql. */
const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
/** Mirrors `profiles_display_name_len` in 0004_social_spots.sql. */
const MAX_DISPLAY_NAME_LENGTH = 40;

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

  // social-spots.md ("Settings" UI spec): handle edit, display name edit,
  // avatar upload. `Profile` carries fields `AuthUser` doesn't (handle,
  // displayName, avatarUrl), so it's fetched separately here; a rejection
  // (e.g. no profile row yet) just leaves these sections in their empty
  // starting state rather than surfacing an error banner.
  const [profile, setProfile] = useState<Profile | null>(null);

  const [handle, setHandle] = useState("");
  const [handleStatus, setHandleStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "saving" | "saved" | "error"
  >("idle");

  const [displayName, setDisplayName] = useState("");
  const [lastSavedDisplayName, setLastSavedDisplayName] = useState("");
  const [displayNameStatus, setDisplayNameStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

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

  useEffect(() => {
    let isMounted = true;

    getMyProfile()
      .then((result) => {
        if (!isMounted || !result) return;
        setProfile(result);
        setHandle(result.handle);
        setDisplayName(result.displayName);
        setLastSavedDisplayName(result.displayName);
      })
      .catch(() => {
        // No profile yet (or the request failed) -- the handle/display
        // name/avatar sections just stay in their empty starting state.
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Live availability check as the handle is edited, debounced -- mirrors
  // the PRD's "Handle gate" live-availability behavior. Every `setState`
  // call here happens inside the `setTimeout`/`.then()` callbacks (never
  // synchronously in the effect body itself) -- the "idle" reset on every
  // keystroke instead lives in the input's own `onChange` below, and the
  // "invalid format" message is a plain derived value in the render below,
  // not a status this effect needs to set at all.
  useEffect(() => {
    if (!profile) return;

    const trimmed = handle.trim().toLowerCase();
    if (trimmed === profile.handle || !HANDLE_PATTERN.test(trimmed)) return;

    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      setHandleStatus("checking");
      isHandleAvailable(trimmed).then((available) => {
        if (!cancelled) setHandleStatus(available ? "available" : "taken");
      });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [handle, profile]);

  const trimmedHandleInput = handle.trim().toLowerCase();
  const handleFormatInvalid =
    trimmedHandleInput.length > 0 &&
    trimmedHandleInput !== profile?.handle &&
    !HANDLE_PATTERN.test(trimmedHandleInput);

  async function handleHandleBlur() {
    if (!profile) return;
    const trimmed = handle.trim().toLowerCase();
    if (trimmed === profile.handle) return;
    if (!HANDLE_PATTERN.test(trimmed)) return;

    setHandleStatus("saving");
    try {
      const updated = await updateHandle(trimmed);
      setProfile(updated);
      setHandle(updated.handle);
      setHandleStatus("saved");
    } catch {
      setHandleStatus("error");
    }
  }

  async function handleDisplayNameBlur() {
    const trimmed = displayName.trim();
    if (trimmed === lastSavedDisplayName) return;

    setDisplayNameStatus("saving");
    try {
      const updated = await updateDisplayName(trimmed);
      setProfile(updated);
      setDisplayName(updated.displayName);
      setLastSavedDisplayName(updated.displayName);
      setDisplayNameStatus("saved");
    } catch {
      setDisplayNameStatus("error");
    }
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const url = await uploadAvatar(file);
      const updated = await updateAvatarUrl(url);
      setProfile(updated);
    } catch {
      setAvatarError("Couldn't update your avatar. Try again.");
    } finally {
      setAvatarUploading(false);
    }
  }

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

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_HEADING_CLASS}>Avatar</h2>
        <div className="flex items-center gap-4">
          <Avatar
            handle={profile?.handle ?? ""}
            avatarUrl={profile?.avatarUrl ?? null}
            displayName={profile?.displayName}
            size={56}
          />
          <label
            className={`inline-flex min-h-10 w-fit cursor-pointer items-center rounded border border-stone bg-cream px-4 py-2 text-sm font-bold text-ink hover:bg-cream-deep ${
              avatarUploading ? "pointer-events-none opacity-60" : ""
            }`}
          >
            {avatarUploading ? "Uploading…" : "Change avatar"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={handleAvatarChange}
              disabled={avatarUploading}
            />
          </label>
        </div>
        {avatarError && <p className="text-xs text-cardinal">{avatarError}</p>}
      </section>

      <SectionDivider />

      <section className="flex flex-col gap-2">
        <h2 className={SECTION_HEADING_CLASS}>Handle</h2>
        <p className="text-sm text-ink/70">
          Your @handle is how people find and mention you. Lowercase letters,
          numbers, and underscores only.
        </p>
        <label htmlFor="handle" className={FIELD_LABEL_CLASS}>
          Handle
        </label>
        <input
          id="handle"
          type="text"
          value={handle}
          maxLength={20}
          onChange={(e) => {
            setHandle(e.target.value);
            setHandleStatus("idle");
          }}
          onBlur={handleHandleBlur}
          className={INPUT_CLASS}
          placeholder="e.g. kuya_ben"
        />
        {handleFormatInvalid && (
          <p className="text-xs text-cardinal">
            Handle must be 3-20 lowercase letters, numbers, or underscores.
          </p>
        )}
        {!handleFormatInvalid && handleStatus === "checking" && (
          <p className="text-xs text-stone-deep">Checking availability…</p>
        )}
        {!handleFormatInvalid && handleStatus === "available" && (
          <p className="text-xs text-teal">That handle is available.</p>
        )}
        {!handleFormatInvalid && handleStatus === "taken" && (
          <p className="text-xs text-cardinal">That handle is taken.</p>
        )}
        {!handleFormatInvalid && handleStatus === "saved" && (
          <p className="text-xs text-stone-deep">Saved.</p>
        )}
        {handleStatus === "error" && (
          <p className="text-xs text-cardinal">
            Couldn&rsquo;t save your handle. Try again.
          </p>
        )}
      </section>

      <SectionDivider />

      <section className="flex flex-col gap-2">
        <h2 className={SECTION_HEADING_CLASS}>Display name</h2>
        <p className="text-sm text-ink/70">
          Shown on your profile and next to spots you add.
        </p>
        <label htmlFor="display-name" className={FIELD_LABEL_CLASS}>
          Display name
        </label>
        <input
          id="display-name"
          type="text"
          value={displayName}
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          onChange={(e) => {
            setDisplayName(e.target.value);
            setDisplayNameStatus("idle");
          }}
          onBlur={handleDisplayNameBlur}
          className={INPUT_CLASS}
          placeholder="e.g. Kuya Ben"
        />
        {displayNameStatus === "saving" && (
          <p className="text-xs text-stone-deep">Saving…</p>
        )}
        {displayNameStatus === "saved" && (
          <p className="text-xs text-stone-deep">Saved.</p>
        )}
        {displayNameStatus === "error" && (
          <p className="text-xs text-cardinal">
            Couldn&rsquo;t save your display name. Try again.
          </p>
        )}
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

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import Avatar from "@/components/Avatar";
import Bilingual from "@/components/Bilingual";
import ClipboardShell from "@/components/ClipboardShell";
import SignInPrompt from "@/components/SignInPrompt";
import { bilingualLabel } from "@/lib/copy";
import { feedNuevo } from "@/lib/feed-repo";
import { follow, followingIds, isFollowing, searchProfiles, unfollow } from "@/lib/profiles-repo";
import type { Profile } from "@/lib/profiles";
import type { SpotAuthor, SpotCard } from "@/lib/spots";

const SEARCH_DEBOUNCE_MS = 300;

const FOLLOW_BUTTON_CLASS =
  "inline-flex min-h-9 items-center rounded bg-terracotta px-3 py-1.5 text-xs font-bold " +
  "text-cream hover:bg-terracotta-deep";
const FOLLOWING_BUTTON_CLASS =
  "inline-flex min-h-9 items-center rounded bg-teal px-3 py-1.5 text-xs font-bold " +
  "text-cream hover:bg-teal-deep";

interface PersonRowProps {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isSelf: boolean;
  isFollowing: boolean;
  onToggleFollow: () => void;
}

function PersonRow({ id, handle, displayName, avatarUrl, isSelf, isFollowing: following, onToggleFollow }: PersonRowProps) {
  return (
    <li key={id} className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-3">
        <Avatar handle={handle} avatarUrl={avatarUrl} displayName={displayName} size={40} />
        <div className="flex flex-col">
          <span className="text-sm font-bold text-ink">@{handle}</span>
          {displayName && <span className="text-xs text-stone-deep">{displayName}</span>}
        </div>
      </div>
      {!isSelf && (
        <button
          type="button"
          onClick={onToggleFollow}
          aria-label={bilingualLabel(following ? "followingState" : "follow")}
          className={following ? FOLLOWING_BUTTON_CLASS : FOLLOW_BUTTON_CLASS}
        >
          <Bilingual k={following ? "followingState" : "follow"} tone="inherit" />
        </button>
      )}
    </li>
  );
}

/**
 * social-spots.md ("Gente" UI spec): search by handle/display name, a
 * "Siguiendo" section, and a "Gente nueva" section (recent posters not
 * followed). There is no dedicated repo call for "every profile I follow"
 * (only `followingIds()`, which returns bare ids) -- both sections are
 * derived from `feedNuevo(30)`'s authors, split by `followingIds()`. This
 * means "Siguiendo" only surfaces followed accounts with a recent spot, not
 * every account followed; documented in notes.md as a known limitation
 * rather than a silent gap.
 */
export default function GentePage() {
  const { status, user } = useAuth();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [resultsFollowing, setResultsFollowing] = useState<Record<string, boolean>>({});

  const [nuevoAuthors, setNuevoAuthors] = useState<SpotAuthor[]>([]);
  const [followingIdSet, setFollowingIdSet] = useState<Set<string>>(new Set());

  const [showSignIn, setShowSignIn] = useState(false);

  // Clearing the field back to blank is handled inline in the input's own
  // `onChange` below (an event handler, not an effect) -- this effect only
  // ever needs to *set* results from the debounced fetch's own callback.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;

    const timeout = setTimeout(() => {
      searchProfiles(trimmed)
        .then(setResults)
        .catch(() => setResults([]));
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    let active = true;

    // Each call gets its own try/catch *and* is awaited on its own line --
    // `Promise.all([feedNuevo(30), followingIds()])` would leave whichever
    // promise the array literal builds first dangling (unobserved, so it
    // surfaces as an "unhandled rejection") the moment building that same
    // literal throws synchronously while evaluating the second call. Two
    // fully-settled calls in sequence side-step that entirely.
    async function loadCards(): Promise<SpotCard[]> {
      try {
        return await feedNuevo(30);
      } catch {
        return [];
      }
    }

    async function loadFollowingIds(): Promise<Set<string>> {
      try {
        return await followingIds();
      } catch {
        return new Set();
      }
    }

    async function load() {
      const cards = await loadCards();
      const ids = await loadFollowingIds();
      if (!active) return;

      setFollowingIdSet(ids);
      const authorsById = new Map<string, SpotAuthor>();
      for (const card of cards) {
        if (!authorsById.has(card.author.id)) authorsById.set(card.author.id, card.author);
      }
      setNuevoAuthors(Array.from(authorsById.values()));
    }

    load();

    return () => {
      active = false;
    };
  }, [status]);

  useEffect(() => {
    const targets = results.filter((profile) => !user || profile.id !== user.id);
    if (targets.length === 0) return;

    let active = true;
    Promise.all(targets.map((profile) => isFollowing(profile.id).then((value) => [profile.id, value] as const)))
      .then((pairs) => {
        if (!active) return;
        setResultsFollowing((prev) => {
          const next = { ...prev };
          for (const [id, value] of pairs) next[id] = value;
          return next;
        });
      });

    return () => {
      active = false;
    };
  }, [results, user]);

  const siguiendoAuthors = useMemo(
    () => nuevoAuthors.filter((author) => followingIdSet.has(author.id)),
    [nuevoAuthors, followingIdSet],
  );
  const genteNuevaAuthors = useMemo(
    () =>
      nuevoAuthors.filter((author) => !followingIdSet.has(author.id) && author.id !== user?.id),
    [nuevoAuthors, followingIdSet, user],
  );

  async function toggleFollow(profileId: string, currentlyFollowing: boolean, onOptimistic: (next: boolean) => void, onRollback: (prev: boolean) => void) {
    if (status !== "signed-in") {
      setShowSignIn(true);
      return;
    }

    onOptimistic(!currentlyFollowing);
    try {
      if (currentlyFollowing) {
        await unfollow(profileId);
      } else {
        await follow(profileId);
      }
    } catch {
      onRollback(currentlyFollowing);
    }
  }

  function handleResultToggle(profileId: string) {
    const currentlyFollowing = Boolean(resultsFollowing[profileId]);
    toggleFollow(
      profileId,
      currentlyFollowing,
      (next) => setResultsFollowing((prev) => ({ ...prev, [profileId]: next })),
      (prev) => setResultsFollowing((current) => ({ ...current, [profileId]: prev })),
    );
  }

  function handleFeedAuthorToggle(authorId: string, currentlyFollowing: boolean) {
    toggleFollow(
      authorId,
      currentlyFollowing,
      (next) =>
        setFollowingIdSet((prev) => {
          const nextSet = new Set(prev);
          if (next) nextSet.add(authorId);
          else nextSet.delete(authorId);
          return nextSet;
        }),
      (prev) =>
        setFollowingIdSet((current) => {
          const nextSet = new Set(current);
          if (prev) nextSet.add(authorId);
          else nextSet.delete(authorId);
          return nextSet;
        }),
    );
  }

  return (
    <ClipboardShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1
            className="text-xl font-semibold text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <Bilingual k="gente" />
          </h1>
          <label htmlFor="gente-search" className="sr-only">
            {bilingualLabel("findPeople")}
          </label>
          <input
            id="gente-search"
            type="text"
            value={query}
            onChange={(e) => {
              const value = e.target.value;
              setQuery(value);
              if (!value.trim()) setResults([]);
            }}
            aria-label={bilingualLabel("findPeople")}
            placeholder={bilingualLabel("findPeople")}
            className="w-full min-h-11 rounded border border-stone bg-cream px-3 py-2 text-sm text-ink focus:outline-none"
          />
        </div>

        {results.length > 0 && (
          <ul className="flex flex-col divide-y divide-stone">
            {results.map((profile) => (
              <PersonRow
                key={profile.id}
                id={profile.id}
                handle={profile.handle}
                displayName={profile.displayName}
                avatarUrl={profile.avatarUrl}
                isSelf={Boolean(user && user.id === profile.id)}
                isFollowing={Boolean(resultsFollowing[profile.id])}
                onToggleFollow={() => handleResultToggle(profile.id)}
              />
            ))}
          </ul>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-stone-deep">
            <Bilingual k="siguiendo" />
          </h2>
          {siguiendoAuthors.length === 0 ? (
            <p className="text-sm text-stone-deep">
              <Bilingual k="nobodyToday" />
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-stone">
              {siguiendoAuthors.map((author) => (
                <PersonRow
                  key={author.id}
                  id={author.id}
                  handle={author.handle}
                  displayName={author.displayName}
                  avatarUrl={author.avatarUrl}
                  isSelf={Boolean(user && user.id === author.id)}
                  isFollowing
                  onToggleFollow={() => handleFeedAuthorToggle(author.id, true)}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-stone-deep">
            Gente nueva
          </h2>
          {genteNuevaAuthors.length === 0 ? (
            <p className="text-sm text-stone-deep">
              <Bilingual k="nobodyToday" />
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-stone">
              {genteNuevaAuthors.slice(0, 10).map((author) => (
                <PersonRow
                  key={author.id}
                  id={author.id}
                  handle={author.handle}
                  displayName={author.displayName}
                  avatarUrl={author.avatarUrl}
                  isSelf={false}
                  isFollowing={false}
                  onToggleFollow={() => handleFeedAuthorToggle(author.id, false)}
                />
              ))}
            </ul>
          )}
        </section>

        <Link href="/" className="text-sm font-semibold text-terracotta underline underline-offset-2">
          &larr; Back home
        </Link>
      </div>

      {showSignIn && <SignInPrompt action="confirm" onDismiss={() => setShowSignIn(false)} />}
    </ClipboardShell>
  );
}

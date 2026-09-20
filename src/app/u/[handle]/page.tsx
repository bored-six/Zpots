"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ChangeEvent } from "react";

import { useAuth } from "@/components/AuthProvider";
import Avatar from "@/components/Avatar";
import Bilingual from "@/components/Bilingual";
import ClipboardShell from "@/components/ClipboardShell";
import SignInPrompt from "@/components/SignInPrompt";
import SpotPhoto from "@/components/SpotPhoto";
import { FollowIcon } from "@/components/icons/social-icons";
import { bilingualLabel } from "@/lib/copy";
import { spotsByUser } from "@/lib/feed-repo";
import {
  follow,
  getProfileByHandle,
  isFollowing,
  unfollow,
  updateAvatarUrl,
  uploadAvatar,
} from "@/lib/profiles-repo";
import type { Profile } from "@/lib/profiles";
import type { SpotCard } from "@/lib/spots";

type FollowState = "not-following" | "following";

const FOLLOW_BUTTON_CLASS =
  "inline-flex min-h-10 items-center gap-2 rounded bg-terracotta px-4 py-2 text-sm font-bold " +
  "text-cream hover:bg-terracotta-deep";
const FOLLOWING_BUTTON_CLASS =
  "inline-flex min-h-10 items-center gap-2 rounded bg-teal px-4 py-2 text-sm font-bold " +
  "text-cream hover:bg-teal-deep";

function ProfileNotFound() {
  return (
    <div className="flex flex-col items-start gap-2 rounded border border-stone bg-cream p-5">
      <p className="text-lg font-bold text-ink">{bilingualLabel("profileNotFound")}</p>
      <Link href="/" className="text-sm font-semibold text-terracotta underline underline-offset-2">
        &larr; Back home
      </Link>
    </div>
  );
}

/**
 * social-spots.md ("Profile" UI spec): avatar (upload on own), @handle,
 * display name, follower/following counts, follow control, needs-handle
 * banner, and a grid of the person's spots.
 */
export default function ProfilePage() {
  const params = useParams<{ handle: string }>();
  const handle = typeof params.handle === "string" ? params.handle : "";
  const { status, user } = useAuth();

  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [spotsLoaded, setSpotsLoaded] = useState(false);
  const [spots, setSpots] = useState<SpotCard[]>([]);

  const [followState, setFollowState] = useState<FollowState>("not-following");
  const [showSignIn, setShowSignIn] = useState(false);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const isOwnProfile = Boolean(profile && user && profile.id === user.id);

  useEffect(() => {
    let active = true;

    getProfileByHandle(handle)
      .then((result) => {
        if (!active) return;
        setProfile(result);
        setAvatarUrl(result?.avatarUrl ?? null);
        setProfileLoaded(true);
      })
      .catch(() => {
        if (active) setProfileLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [handle]);

  useEffect(() => {
    if (!profile) return;
    let active = true;

    spotsByUser(profile.id)
      .then((cards) => {
        if (!active) return;
        setSpots(cards);
        setSpotsLoaded(true);
      })
      .catch(() => {
        if (active) setSpotsLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    if (user && user.id === profile.id) return; // own profile -- no follow state to fetch

    let active = true;
    isFollowing(profile.id).then((result) => {
      if (active) setFollowState(result ? "following" : "not-following");
    });

    return () => {
      active = false;
    };
  }, [profile, user]);

  async function handleFollowClick() {
    if (!profile) return;

    if (status !== "signed-in") {
      setShowSignIn(true);
      return;
    }

    if (followState === "following") {
      setFollowState("not-following");
      try {
        await unfollow(profile.id);
      } catch {
        setFollowState("following");
      }
      return;
    }

    setFollowState("following");
    try {
      await follow(profile.id);
    } catch {
      setFollowState("not-following");
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
      setAvatarUrl(updated.avatarUrl);
    } catch {
      setAvatarError("Couldn't update your avatar. Try again.");
    } finally {
      setAvatarUploading(false);
    }
  }

  if (profileLoaded && !profile) {
    return (
      <ClipboardShell>
        <ProfileNotFound />
      </ClipboardShell>
    );
  }

  return (
    <ClipboardShell>
      <div className="flex flex-col gap-6">
        {profile && (
          <>
            {isOwnProfile && profile.needsHandle && (
              <div className="flex items-center justify-between gap-3 rounded border border-stone bg-cream-deep px-4 py-3">
                <p className="text-sm font-bold text-ink">
                  <Bilingual k="pickHandle" />
                </p>
                <Link
                  href="/settings"
                  className="text-sm font-semibold text-terracotta underline underline-offset-2"
                >
                  Settings
                </Link>
              </div>
            )}

            <div className="flex items-start gap-4">
              <div className="relative shrink-0">
                <Avatar
                  handle={profile.handle}
                  avatarUrl={avatarUrl}
                  displayName={profile.displayName}
                  size={88}
                />
                {isOwnProfile && (
                  <label
                    aria-label="Change avatar"
                    className={`absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-tinta/0 text-[0px] transition hover:bg-tinta/30 hover:text-[11px] hover:font-bold hover:text-cream ${
                      avatarUploading ? "pointer-events-none" : ""
                    }`}
                  >
                    {avatarUploading ? "…" : "Edit"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={handleAvatarChange}
                      disabled={avatarUploading}
                    />
                  </label>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <p className="text-sm font-bold uppercase tracking-[0.08em] text-stone-deep">
                  @{profile.handle}
                </p>
                <p
                  className="text-xl font-semibold text-ink"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {profile.displayName || `@${profile.handle}`}
                </p>

                <div className="mt-1 flex items-center gap-4 text-sm text-ink">
                  <span>
                    <span className="font-bold">{profile.followerCount}</span>{" "}
                    <Bilingual k="followers" />
                  </span>
                  <span>
                    <span className="font-bold">{profile.followingCount}</span>{" "}
                    <Bilingual k="followingCount" />
                  </span>
                </div>

                {avatarError && <p className="text-xs text-cardinal">{avatarError}</p>}

                {!isOwnProfile && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={handleFollowClick}
                      aria-label={bilingualLabel(
                        followState === "following" ? "followingState" : "follow",
                      )}
                      className={
                        followState === "following" ? FOLLOWING_BUTTON_CLASS : FOLLOW_BUTTON_CLASS
                      }
                    >
                      <FollowIcon size={16} />
                      <Bilingual
                        k={followState === "following" ? "followingState" : "follow"}
                        tone="inherit"
                      />
                    </button>
                    {followState === "following" && (
                      <p className="mt-1 text-xs text-stone-deep">
                        <Bilingual k="unfollow" />
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-stone pt-4">
              {spotsLoaded && spots.length === 0 ? (
                <p className="text-sm text-stone-deep">
                  <Bilingual k="noSpotsYet" />
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {spots.map((spot) => (
                    <Link
                      key={spot.id}
                      href={`/?spot=${spot.id}`}
                      aria-label={spot.name}
                      className="block aspect-square overflow-hidden rounded border border-stone"
                    >
                      <SpotPhoto photoUrl={spot.photoUrl} name={spot.name} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showSignIn && <SignInPrompt action="follow" onDismiss={() => setShowSignIn(false)} />}
    </ClipboardShell>
  );
}

import { getCurrentUser, requireUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import { generateUuid } from "@/lib/uuid";
import { toProfile, type Profile, type ProfileRow } from "@/lib/profiles";

const PROFILES_TABLE = "profiles";
const FOLLOWS_TABLE = "follows";
const AVATAR_BUCKET = "avatars";

/** Mirrors `profiles_handle_format` in 0004_social_spots.sql. */
const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

/** Mirrors `profiles_display_name_len` in 0004_social_spots.sql. */
const MAX_DISPLAY_NAME_LENGTH = 40;

/** Mirrors the `avatars` bucket's 2 MiB file-size limit. */
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;

const AVATAR_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase();
}

/**
 * The signed-in caller's own profile, or `null` when signed out -- never
 * touches the client in that case (mirrors `fetchMyConfirmedSpotIds`).
 */
export async function getMyProfile(): Promise<Profile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const client = getSupabaseClient();
  const { data, error } = await client
    .from(PROFILES_TABLE)
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;

  return toProfile(data as ProfileRow);
}

/**
 * Public read by handle -- never calls `requireUserId()`. Resolves `null`
 * (not a throw) when no profile matches.
 */
export async function getProfileByHandle(handle: string): Promise<Profile | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(PROFILES_TABLE)
    .select("*")
    .eq("handle", handle)
    .single();

  if (error || !data) return null;

  return toProfile(data as ProfileRow);
}

/**
 * Validates the format client-side (lowercased) before ever touching the
 * client, then updates the caller's own row and clears `needs_handle`. A
 * `23505` unique violation becomes a "taken" error.
 */
export async function updateHandle(handle: string): Promise<Profile> {
  const normalized = normalizeHandle(handle);
  if (!HANDLE_PATTERN.test(normalized)) {
    throw new Error("Handle must be 3-20 lowercase letters, numbers, or underscores.");
  }

  const userId = await requireUserId();
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(PROFILES_TABLE)
    .update({ handle: normalized, needs_handle: false })
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new Error("That handle is taken.", { cause: error });
    }
    throw new Error("Failed to update handle.", { cause: error });
  }

  return toProfile(data as ProfileRow);
}

/**
 * Trims and validates length, then updates the caller's own row.
 */
export async function updateDisplayName(displayName: string): Promise<Profile> {
  const trimmed = displayName.trim();
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error(`Display name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters.`);
  }

  const userId = await requireUserId();
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(PROFILES_TABLE)
    .update({ display_name: trimmed })
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    throw new Error("Failed to update display name.", { cause: error });
  }

  return toProfile(data as ProfileRow);
}

/**
 * Anon-callable RPC (`handle_available`) -- never calls `requireUserId()`.
 * An invalid format is rejected client-side without a round trip.
 */
export async function isHandleAvailable(handle: string): Promise<boolean> {
  const normalized = normalizeHandle(handle);
  if (!HANDLE_PATTERN.test(normalized)) {
    return false;
  }

  const client = getSupabaseClient();
  const { data, error } = await client.rpc("handle_available", { handle: normalized });

  if (error) return false;

  return Boolean(data);
}

/**
 * Uploads to the `avatars` bucket under the caller's own folder and returns
 * the public URL. Does not itself write `profiles.avatar_url` -- the
 * caller is responsible for persisting the returned URL (e.g. via
 * `updateDisplayName`'s sibling update path), keeping this function a pure
 * storage operation like `createSpot`'s photo upload step.
 */
export async function uploadAvatar(file: File): Promise<string> {
  const ext = AVATAR_MIME_EXTENSIONS[file.type];
  if (!ext) {
    throw new Error(`Unsupported avatar type: ${file.type}`);
  }

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    throw new Error("Avatar must be smaller than 2 MB.");
  }

  const userId = await requireUserId();
  const client = getSupabaseClient();

  const objectPath = `${userId}/${generateUuid()}.${ext}`;

  const { error: uploadError } = await client.storage.from(AVATAR_BUCKET).upload(objectPath, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });

  if (uploadError) {
    throw new Error("Failed to upload avatar.", { cause: uploadError });
  }

  const {
    data: { publicUrl },
  } = client.storage.from(AVATAR_BUCKET).getPublicUrl(objectPath);

  return publicUrl;
}

/**
 * Persists an already-uploaded avatar URL (from `uploadAvatar`) onto the
 * caller's own row. Same `.update().eq().select().single()` shape as
 * `updateDisplayName` -- kept as its own function since the two are
 * independent edits (a profile page might update one without the other).
 */
export async function updateAvatarUrl(url: string): Promise<Profile> {
  const userId = await requireUserId();
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(PROFILES_TABLE)
    .update({ avatar_url: url })
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    throw new Error("Failed to update avatar.", { cause: error });
  }

  return toProfile(data as ProfileRow);
}

/** Follow is idempotent: a duplicate (23505) is swallowed, not an error. */
export async function follow(followeeId: string): Promise<void> {
  const followerId = await requireUserId();

  if (followerId === followeeId) {
    throw new Error("You can't follow yourself.");
  }

  const client = getSupabaseClient();
  const { error } = await client.from(FOLLOWS_TABLE).insert({
    follower_id: followerId,
    followee_id: followeeId,
  });

  if (error && (error as { code?: string }).code !== "23505") {
    throw new Error("Failed to follow.", { cause: error });
  }
}

/** Unfollow is idempotent: deleting a row that doesn't exist is a no-op. */
export async function unfollow(followeeId: string): Promise<void> {
  const followerId = await requireUserId();
  const client = getSupabaseClient();

  const { error } = await client
    .from(FOLLOWS_TABLE)
    .delete()
    .eq("follower_id", followerId)
    .eq("followee_id", followeeId);

  if (error) {
    throw new Error("Failed to unfollow.", { cause: error });
  }
}

/** Resolves `false` without a client call when signed out. */
export async function isFollowing(followeeId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;

  const client = getSupabaseClient();
  const { data, error } = await client
    .from(FOLLOWS_TABLE)
    .select("follower_id")
    .eq("follower_id", user.id)
    .eq("followee_id", followeeId);

  if (error) return false;

  return Array.isArray(data) && data.length > 0;
}

/** Every profile id this account follows. Empty set when signed out. */
export async function followingIds(): Promise<Set<string>> {
  const user = await getCurrentUser();
  if (!user) return new Set();

  const client = getSupabaseClient();
  const { data, error } = await client
    .from(FOLLOWS_TABLE)
    .select("followee_id")
    .eq("follower_id", user.id);

  if (error) {
    throw new Error("Failed to fetch following.", { cause: error });
  }

  return new Set(((data as { followee_id: string }[] | null) ?? []).map((row) => row.followee_id));
}

/**
 * Searches by handle or display name (ilike, up to `limit` results).
 * Resolves an empty array without touching the client for a blank query.
 */
export async function searchProfiles(query: string, limit = 20): Promise<Profile[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const client = getSupabaseClient();
  const pattern = `%${trimmed}%`;

  const { data, error } = await client
    .from(PROFILES_TABLE)
    .select("*")
    .or(`handle.ilike.${pattern},display_name.ilike.${pattern}`)
    .limit(limit);

  if (error) {
    throw new Error("Failed to search profiles.", { cause: error });
  }

  return ((data as ProfileRow[] | null) ?? []).map(toProfile);
}

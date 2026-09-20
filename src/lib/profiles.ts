/**
 * A user's public identity: handle, display name, avatar, follow counts.
 * Maps to `public.profiles` (0004_social_spots.sql), PK = auth.users.id.
 */
export interface Profile {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  /** true until the user picks a handle to replace the `zp_<8 hex>` placeholder. */
  needsHandle: boolean;
  followerCount: number;
  followingCount: number;
  createdAt: string;
}

/** Raw Postgres row shape for public.profiles (snake_case). */
export type ProfileRow = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  needs_handle: boolean;
  follower_count: number;
  following_count: number;
  created_at: string;
};

/** Maps a `ProfileRow` (or a test double sharing the same field names) to `Profile`. */
export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    needsHandle: row.needs_handle,
    followerCount: row.follower_count,
    followingCount: row.following_count,
    createdAt: row.created_at,
  };
}

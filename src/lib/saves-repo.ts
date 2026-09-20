import { getCurrentUser, requireUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import { toSpotCard, type SpotCardRow } from "@/lib/spots-repo";
import type { MapSource, MapSpot } from "@/lib/spots";

const SAVES_TABLE = "saves";

/**
 * Saves the spot for the signed-in account. Idempotent: saving the same
 * spot twice never throws -- a `23505` duplicate on `(user_id, spot_id)` is
 * treated as a no-op, same convention as `confirmSpot`/`reportSpot`.
 */
export async function saveSpot(spotId: string): Promise<void> {
  const userId = await requireUserId();
  const client = getSupabaseClient();

  const { error } = await client.from(SAVES_TABLE).insert({ user_id: userId, spot_id: spotId });

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") return;
    throw new Error("Failed to save spot.", { cause: error });
  }
}

/**
 * Removes the save for the signed-in account. Idempotent: unsaving a spot
 * you never saved never throws, and only the calling account's own row is
 * removed (RLS scopes the delete; the query also filters on user_id).
 */
export async function unsaveSpot(spotId: string): Promise<void> {
  const userId = await requireUserId();
  const client = getSupabaseClient();

  const { error } = await client
    .from(SAVES_TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("spot_id", spotId);

  if (error) {
    throw new Error("Failed to remove saved spot.", { cause: error });
  }
}

/**
 * Every spot id the signed-in account has saved. Signed-out visitors get an
 * empty set without ever calling getSupabaseClient() -- same convention as
 * `fetchMyConfirmedSpotIds`.
 */
export async function mySavedIds(): Promise<Set<string>> {
  const user = await getCurrentUser();
  if (!user) return new Set();

  const client = getSupabaseClient();
  const { data, error } = await client.from(SAVES_TABLE).select("spot_id");

  if (error) {
    throw new Error("Failed to fetch your saved spots.", { cause: error });
  }

  return new Set(((data as { spot_id: string }[] | null) ?? []).map((row) => row.spot_id));
}

/**
 * The signed-in account's personal map: own posts, spots they've been to,
 * and spots they've saved (`my_map()`, source `'mine' | 'been' | 'saved'`).
 * Signed-out visitors get an empty array without ever reaching the client.
 */
export async function myMap(): Promise<MapSpot[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const client = getSupabaseClient();
  const { data, error } = await client.rpc("my_map", {});

  if (error) {
    throw new Error("Failed to load your map.", { cause: error });
  }

  const rows = (data as (SpotCardRow & { source: MapSource })[] | null) ?? [];

  return rows.map((row) => ({ ...toSpotCard(row), source: row.source }));
}

import { getCurrentUser } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import { toSpotCard, type SpotCardRow } from "@/lib/spots-repo";
import type { SpotCard } from "@/lib/spots";

const DEFAULT_PAGE_SIZE = 10;

/** Keyset cursor for the newest-first feeds (`feedNuevo`/`feedSiguiendo`). */
export interface FeedCursor {
  createdAt: string;
  id: string;
}

function rowsToCards(rows: unknown): SpotCard[] {
  return ((rows as SpotCardRow[] | null) ?? []).map(toSpotCard);
}

/**
 * Cerca (near me): every spot ordered by distance from `(lat, lng)`, offset
 * paginated. Public -- never calls `requireUserId`, works the same signed
 * in or signed out.
 */
export async function feedCerca(
  lat: number,
  lng: number,
  pageSize = DEFAULT_PAGE_SIZE,
  pageOffset = 0,
): Promise<SpotCard[]> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("feed_cerca", {
    lat,
    lng,
    page_size: pageSize,
    page_offset: pageOffset,
  });

  if (error) {
    throw new Error("Failed to load nearby spots.", { cause: error });
  }

  return rowsToCards(data);
}

/**
 * Nuevo (newest): every spot, newest first, keyset-paginated on
 * `(created_at, id)`. Public.
 */
export async function feedNuevo(
  pageSize = DEFAULT_PAGE_SIZE,
  cursor?: FeedCursor,
): Promise<SpotCard[]> {
  // Reads the session (never gates on it -- Nuevo is public either way) so
  // a signed-in caller's account is already warm for whatever the deck
  // does next with it (e.g. the save/been button state alongside this row).
  await getCurrentUser();

  const client = getSupabaseClient();
  const { data, error } = await client.rpc("feed_nuevo", {
    page_size: pageSize,
    before_created_at: cursor?.createdAt ?? null,
    before_id: cursor?.id ?? null,
  });

  if (error) {
    throw new Error("Failed to load new spots.", { cause: error });
  }

  return rowsToCards(data);
}

/**
 * Siguiendo (following): same paging shape as Nuevo, scoped to accounts I
 * follow. Signed out has nobody to follow -- resolves empty without ever
 * reaching the client.
 */
export async function feedSiguiendo(
  pageSize = DEFAULT_PAGE_SIZE,
  cursor?: FeedCursor,
): Promise<SpotCard[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const client = getSupabaseClient();
  const { data, error } = await client.rpc("feed_siguiendo", {
    page_size: pageSize,
    before_created_at: cursor?.createdAt ?? null,
    before_id: cursor?.id ?? null,
  });

  if (error) {
    throw new Error("Failed to load spots from people you follow.", { cause: error });
  }

  return rowsToCards(data);
}

/** One entry in the Hoy row: a followee who dropped a spot in the last 24h. */
export interface HoyEntry {
  spotId: string;
  author: {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

/**
 * Hoy: followees with a spot in the last 24 hours, newest first, max 20.
 * Signed out has nobody to follow -- resolves empty without ever reaching
 * the client.
 */
export async function hoyRow(): Promise<HoyEntry[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const client = getSupabaseClient();
  const { data, error } = await client.rpc("hoy_row", {});

  if (error) {
    throw new Error("Failed to load today's spots.", { cause: error });
  }

  const rows =
    (data as
      | { spot_id: string; id: string; handle: string; display_name: string; avatar_url: string | null }[]
      | null) ?? [];

  return rows.map((row) => ({
    spotId: row.spot_id,
    author: {
      id: row.id,
      handle: row.handle,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    },
  }));
}

/**
 * A profile's public grid: their spots, newest first, keyset-paginated on
 * `(created_at, id)`. Public -- reads straight off `spot_cards`, never
 * calls `requireUserId`.
 */
export async function spotsByUser(
  userId: string,
  pageSize = DEFAULT_PAGE_SIZE,
  cursor?: FeedCursor,
): Promise<SpotCard[]> {
  const client = getSupabaseClient();

  let query = client
    .from("spot_cards")
    .select("*")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(pageSize);

  if (cursor) {
    query = query.lt("created_at", cursor.createdAt);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("Failed to load this person's spots.", { cause: error });
  }

  return rowsToCards(data);
}

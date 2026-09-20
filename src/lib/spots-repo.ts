import { getCurrentUser, requireUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import { generateUuid } from "@/lib/uuid";
import {
  isConfirmed,
  type Spot,
  type SpotCard,
  type SpotStatus,
} from "@/lib/spots";
import {
  MAX_REPORT_DETAILS_LENGTH,
  isValidReportReason,
  validateNewSpot,
  type NewSpotInput,
} from "@/lib/validation";

const SPOTS_TABLE = "spots";
const CONFIRMATIONS_TABLE = "confirmations";
const REPORTS_TABLE = "reports";
const PHOTO_BUCKET = "spot-photos";

/** Raw Postgres row shape for public.spots (snake_case). */
type SpotRow = {
  id: string;
  name: string;
  note: string;
  lat: number;
  lng: number;
  nickname?: string | null;
  photo_url?: string | null;
  status: SpotStatus;
  confirmations: number;
  created_at?: string;
  created_by?: string;
};

/**
 * Raw row shape for `public.spot_cards` (social-spots.md) -- a `SpotRow`
 * joined to its author's `profiles` columns. `created_by` is the author's
 * id; `handle`/`display_name`/`avatar_url` come from `profiles`.
 * `distance_m` is present only on rows from `feed_cerca`.
 */
export type SpotCardRow = SpotRow & {
  created_by: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  distance_m?: number;
};

/** Maps a `SpotRow` (or a test double sharing the same field names) to `Spot`. */
function toSpot(row: SpotRow): Spot {
  const spot: Spot = {
    id: row.id,
    name: row.name,
    note: row.note,
    lat: row.lat,
    lng: row.lng,
    status: row.status,
    confirmations: row.confirmations,
    createdAt: row.created_at as string,
  };

  if (row.nickname != null) spot.nickname = row.nickname;
  if (row.photo_url != null) spot.photoUrl = row.photo_url;

  return spot;
}

/**
 * Maps a `spot_cards` row (or a `feed_*`/`my_map()` row, which share the
 * same shape plus an optional `distance_m`) to a `SpotCard`. `distanceM` is
 * only set when the row carries `distance_m` (feedCerca) -- feedNuevo and
 * feedSiguiendo rows never attach one.
 */
export function toSpotCard(row: SpotCardRow): SpotCard {
  const card: SpotCard = {
    ...toSpot(row),
    author: {
      id: row.created_by,
      handle: row.handle,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    },
  };

  if (row.distance_m != null) card.distanceM = row.distance_m;

  return card;
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function extensionForMime(mime: string): string {
  const ext = MIME_EXTENSIONS[mime];
  if (!ext) {
    throw new Error(`Unsupported photo type: ${mime}`);
  }
  return ext;
}

const SESSION_EXPIRED_MESSAGE = "Your session expired. Sign in again to add this spot.";

/**
 * A Postgres `42501` (insufficient privilege) or PostgREST `401` on a write
 * means the session died between the click and the request (expired JWT
 * that autoRefresh could not save, or a policy rejection). Distinct from a
 * `23505` duplicate, which is a normal, expected outcome.
 */
function isSessionExpiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  const status = (error as { status?: unknown }).status;
  return code === "42501" || status === 401;
}

/**
 * Uploads the photo, then inserts the spot row. Never inserts when the
 * upload fails, and never touches storage for input that fails validation
 * (defense in depth beyond AddSpotForm).
 */
export async function createSpot(input: NewSpotInput): Promise<Spot> {
  const validation = validateNewSpot(input);
  if (!validation.valid) {
    throw new Error("Invalid spot input.", { cause: validation.errors });
  }

  // Throws before getSupabaseClient() is even called when signed out --
  // this is what prevents an orphaned photo upload from a signed-out
  // submit (auth-migration.md section 6.3).
  await requireUserId();

  const photoFile = input.photoFile as File;
  const client = getSupabaseClient();

  const id = generateUuid();
  const ext = extensionForMime(photoFile.type);
  const objectPath = `${id}.${ext}`;

  const { error: uploadError } = await client.storage.from(PHOTO_BUCKET).upload(objectPath, photoFile, {
    contentType: photoFile.type,
    cacheControl: "31536000",
    upsert: false,
  });

  if (uploadError) {
    if (isSessionExpiredError(uploadError)) {
      throw new Error(SESSION_EXPIRED_MESSAGE, { cause: uploadError });
    }
    throw new Error("Failed to upload spot photo.", { cause: uploadError });
  }

  const {
    data: { publicUrl },
  } = client.storage.from(PHOTO_BUCKET).getPublicUrl(objectPath);

  // created_by is deliberately absent -- it isn't in the INSERT column
  // grant, so the DB fills it from auth.uid() and a client-sent value
  // would be rejected outright (auth-migration.md section 4.4 / D4).
  const payload = {
    id,
    name: input.name.trim(),
    note: input.note.trim(),
    lat: input.lat,
    lng: input.lng,
    nickname: input.nickname?.trim() || null,
    photo_url: publicUrl,
    status: "unconfirmed" as const,
    confirmations: 0,
  };

  const { data, error } = await client.from(SPOTS_TABLE).insert(payload);

  if (error) {
    if (isSessionExpiredError(error)) {
      throw new Error(SESSION_EXPIRED_MESSAGE, { cause: error });
    }
    throw new Error("Failed to create spot.", { cause: error });
  }

  // Real supabase-js v2 sends `Prefer: return=minimal` on a bare insert, so
  // `data` is `null` in production -- fall back to a locally-assembled
  // copy with a client-side `created_at` approximation (spec F2).
  return toSpot((data as SpotRow | null) ?? { ...payload, created_at: new Date().toISOString() });
}

/**
 * Reads the spot before inserting the confirmation so the optimistic +1 is
 * arithmetically right against the pre-write state. A duplicate
 * (spot_id, confirmer_id) pair is a `23505` unique violation, treated as a
 * no-op read rather than an error.
 *
 * Signature change (D9): `confirmerId` is no longer a parameter -- the
 * confirmer's id comes from `requireUserId()`, which is also what a
 * signed-out call fails on, before any query runs.
 */
export async function confirmSpot(spotId: string): Promise<Spot> {
  const confirmerId = await requireUserId();
  const client = getSupabaseClient();

  const { data: current, error: readError } = await client
    .from(SPOTS_TABLE)
    .select("*")
    .eq("id", spotId)
    .single();

  if (readError || !current) {
    throw new Error("Spot not found.", { cause: readError });
  }

  const currentRow = current as SpotRow;

  const { error: insertError } = await client
    .from(CONFIRMATIONS_TABLE)
    .insert({ spot_id: spotId, confirmer_id: confirmerId });

  const isDuplicate = Boolean(insertError) && (insertError as { code?: string }).code === "23505";

  if (insertError && !isDuplicate) {
    // 42501 here means either "not signed in" or "confirmer_id != auth.uid()"
    // -- it is never a duplicate (that's the 23505 branch above).
    if (isSessionExpiredError(insertError)) {
      throw new Error(SESSION_EXPIRED_MESSAGE, { cause: insertError });
    }
    throw new Error("Failed to record confirmation.", { cause: insertError });
  }

  if (isDuplicate) {
    return toSpot(currentRow);
  }

  const nextConfirmations = currentRow.confirmations + 1;
  const nextSpot: Spot = { ...toSpot(currentRow), confirmations: nextConfirmations };
  const status: SpotStatus = isConfirmed(nextSpot) ? "confirmed" : "unconfirmed";

  const { data: updated, error: updateError } = await client
    .from(SPOTS_TABLE)
    .update({ confirmations: nextConfirmations, status })
    .eq("id", spotId)
    .select()
    .single();

  if (updateError || !updated) {
    throw new Error("Failed to update spot after confirmation.", { cause: updateError });
  }

  return toSpot(updated as SpotRow);
}

/**
 * Rejects before any network call for an invalid reason (defense in depth
 * beyond ReportButton) -- reason validation runs before `requireUserId()`,
 * so a signed-out visitor never even gets an "auth required" error for a
 * malformed reason; they get the same validation error a signed-in caller
 * would.
 */
export async function reportSpot(spotId: string, reason: string, details?: string): Promise<void> {
  if (!isValidReportReason(reason)) {
    throw new Error(`Invalid report reason: ${reason}`);
  }

  const trimmedDetails = details?.trim() || null;

  if (trimmedDetails !== null && trimmedDetails.length > MAX_REPORT_DETAILS_LENGTH) {
    throw new Error(`Report details must be at most ${MAX_REPORT_DETAILS_LENGTH} characters.`);
  }

  await requireUserId();

  // reported_by is deliberately absent -- same reasoning as spots.created_by
  // above; the DB fills it from auth.uid().
  const client = getSupabaseClient();
  const { error } = await client.from(REPORTS_TABLE).insert({
    spot_id: spotId,
    reason,
    details: trimmedDetails,
  });

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      // Already reported this spot from this account -- idempotent, not an
      // error (auth-migration.md section 4.4: unique (spot_id, reported_by)).
      return;
    }
    if (isSessionExpiredError(error)) {
      throw new Error(SESSION_EXPIRED_MESSAGE, { cause: error });
    }
    throw new Error("Failed to submit report.", { cause: error });
  }
}

/**
 * Every spot id this account has confirmed, per the database (RLS scopes
 * `confirmations` rows to the caller). Signed-out visitors get an empty set
 * without ever calling getSupabaseClient() -- a query in that state would
 * just 401.
 */
export async function fetchMyConfirmedSpotIds(): Promise<Set<string>> {
  const user = await getCurrentUser();
  if (!user) return new Set();

  const client = getSupabaseClient();
  const { data, error } = await client.from(CONFIRMATIONS_TABLE).select("spot_id");

  if (error) {
    throw new Error("Failed to fetch your confirmations.", { cause: error });
  }

  return new Set(((data as { spot_id: string }[] | null) ?? []).map((row) => row.spot_id));
}

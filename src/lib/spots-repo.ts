import { getSupabaseClient } from "@/lib/supabase";
import { generateUuid } from "@/lib/uuid";
import {
  isConfirmed,
  type Spot,
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

/**
 * Fetches every spot. No `.order()` / `.limit()` / `.range()` is chained
 * after `select('*')` (spec F6) -- sort client-side if the UI needs one.
 */
export async function fetchSpots(): Promise<Spot[]> {
  const client = getSupabaseClient();
  const { data, error } = await client.from(SPOTS_TABLE).select("*");

  if (error) {
    throw new Error("Failed to fetch spots.", { cause: error });
  }

  return ((data as SpotRow[] | null) ?? []).map(toSpot);
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
    throw new Error("Failed to upload spot photo.", { cause: uploadError });
  }

  const {
    data: { publicUrl },
  } = client.storage.from(PHOTO_BUCKET).getPublicUrl(objectPath);

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
 */
export async function confirmSpot(spotId: string, confirmerId: string): Promise<Spot> {
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

/** Rejects before any network call for an invalid reason (defense in depth beyond ReportButton). */
export async function reportSpot(spotId: string, reason: string, details?: string): Promise<void> {
  if (!isValidReportReason(reason)) {
    throw new Error(`Invalid report reason: ${reason}`);
  }

  const trimmedDetails = details?.trim() || null;

  if (trimmedDetails !== null && trimmedDetails.length > MAX_REPORT_DETAILS_LENGTH) {
    throw new Error(`Report details must be at most ${MAX_REPORT_DETAILS_LENGTH} characters.`);
  }

  const client = getSupabaseClient();
  const { error } = await client.from(REPORTS_TABLE).insert({
    spot_id: spotId,
    reason,
    details: trimmedDetails,
  });

  if (error) {
    throw new Error("Failed to submit report.", { cause: error });
  }
}

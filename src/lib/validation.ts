/**
 * Client-side validation for a new spot submission and for report reasons.
 * These constants mirror the CHECK constraints in
 * supabase/migrations/0001_init.sql -- keep both in sync (spec section 5.7).
 */

import { isWithinZamboangaCity } from "@/lib/city-bounds";

/** Mirrors `spots_name_len` in 0001_init.sql. */
export const MAX_NAME_LENGTH = 80;
/** Mirrors `spots_note_len` in 0001_init.sql. */
export const MAX_NOTE_LENGTH = 280;
/** Mirrors `spots_nickname_len` in 0001_init.sql. */
export const MAX_NICKNAME_LENGTH = 40;
/** Mirrors `reports_details_len` in 0001_init.sql. */
export const MAX_REPORT_DETAILS_LENGTH = 500;

/** Mirrors `reports_reason_enum` in 0001_init.sql. */
export const REPORT_REASONS = ["spam", "wrong_info", "closed"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // mirrors storage bucket file_size_limit
const ALLOWED_PHOTO_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export interface NewSpotInput {
  name: string;
  note: string;
  lat: number;
  lng: number;
  /** Optional, purely cosmetic -- never presented as a verified identity. */
  nickname?: string;
  photoFile: File | null;
}

export type NewSpotValidationErrors = Partial<Record<keyof NewSpotInput, string>>;

export type NewSpotValidationResult =
  | { valid: true }
  | { valid: false; errors: NewSpotValidationErrors };

/** Validates every field independently and reports all failures at once. */
export function validateNewSpot(input: NewSpotInput): NewSpotValidationResult {
  const errors: NewSpotValidationErrors = {};

  const trimmedName = input.name.trim();
  if (trimmedName.length < 1 || trimmedName.length > MAX_NAME_LENGTH) {
    errors.name = `Enter a name between 1 and ${MAX_NAME_LENGTH} characters.`;
  }

  const trimmedNote = input.note.trim();
  if (trimmedNote.length < 1 || trimmedNote.length > MAX_NOTE_LENGTH) {
    errors.note = `Enter a note between 1 and ${MAX_NOTE_LENGTH} characters.`;
  }

  if (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90) {
    errors.lat = "Latitude must be between -90 and 90.";
  }

  if (!Number.isFinite(input.lng) || input.lng < -180 || input.lng > 180) {
    errors.lng = "Longitude must be between -180 and 180.";
  }

  if (
    !errors.lat &&
    !errors.lng &&
    Number.isFinite(input.lat) &&
    Number.isFinite(input.lng) &&
    !isWithinZamboangaCity(input.lat, input.lng)
  ) {
    errors.lat = "Pins can only be placed inside Zamboanga City.";
    errors.lng = "Pins can only be placed inside Zamboanga City.";
  }

  if (input.nickname !== undefined && input.nickname.length > MAX_NICKNAME_LENGTH) {
    errors.nickname = `Nickname must be at most ${MAX_NICKNAME_LENGTH} characters.`;
  }

  if (!input.photoFile) {
    errors.photoFile = "A photo is required.";
  } else if (!ALLOWED_PHOTO_MIME_TYPES.has(input.photoFile.type)) {
    errors.photoFile = "Photo must be a JPEG, PNG, WEBP, or GIF image.";
  } else if (input.photoFile.size >= MAX_PHOTO_BYTES) {
    errors.photoFile = "Photo must be under 10MB.";
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

/** Exact-match only -- `'Spam'` or `' spam'` are not valid. */
export function isValidReportReason(reason: string): reason is ReportReason {
  return (REPORT_REASONS as readonly string[]).includes(reason);
}

/**
 * Must match the Supabase dashboard's "Minimum password length" setting
 * (auth-migration.md section 5.2, item 2). Keep both in sync.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Deliberately loose -- trimmed, non-empty, exactly one `@` with non-empty
 * local and domain parts and at least one `.` in the domain. Supabase does
 * the real check (`email_address_invalid`); this only catches obviously
 * malformed input before a network round trip.
 */
export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;

  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 0 || atIndex !== trimmed.lastIndexOf("@")) return false;

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (local.length === 0 || domain.length === 0) return false;
  if (/\s/.test(trimmed)) return false;

  const dotIndex = domain.indexOf(".");
  return dotIndex > 0 && dotIndex < domain.length - 1;
}

export type CredentialsMode = "signin" | "signup";

export type CredentialsValidationErrors = { email?: string; password?: string };

export type CredentialsValidationResult =
  | { valid: true }
  | { valid: false; errors: CredentialsValidationErrors };

/**
 * Sign-in mode only checks non-empty email/password (a signing-in user's
 * existing password may predate a stricter dashboard minimum). Sign-up
 * mode additionally enforces MIN_PASSWORD_LENGTH. Email is trimmed and
 * lower-cased before validation -- the password is never trimmed or
 * altered here or anywhere else.
 */
export function validateCredentials(
  email: string,
  password: string,
  mode: CredentialsMode,
): CredentialsValidationResult {
  const errors: CredentialsValidationErrors = {};

  const normalizedEmail = email.trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) {
    errors.email = "Enter a valid email address.";
  }

  if (mode === "signup") {
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
  } else if (password.length === 0) {
    errors.password = "Enter your password.";
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

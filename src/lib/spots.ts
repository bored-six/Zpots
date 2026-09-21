/** A spot is Unconfirmed until enough distinct people vouch for it. */
export type SpotStatus = "unconfirmed" | "confirmed";

/**
 * Grabado pin categories (pin-revamp-spec.md section 2). Read cue on the pin
 * only -- no DB column, no filter, no legend yet (section 7.1/"Out of
 * scope"). Ids are ASCII; labels carry the accents in the UI copy.
 */
export const SPOT_CATEGORIES = ["come", "senta", "camina", "agua", "mira", "compra"] as const;

export type SpotCategory = (typeof SPOT_CATEGORIES)[number];

export function isSpotCategory(value: unknown): value is SpotCategory {
  return typeof value === "string" && (SPOT_CATEGORIES as readonly string[]).includes(value);
}

export interface Spot {
  id: string;
  name: string;
  note: string;
  lat: number;
  lng: number;
  status: SpotStatus;
  confirmations: number;
  createdAt: string;
  /** Optional, purely cosmetic -- never presented as a verified identity. */
  nickname?: string;
  /** Public storage URL for the spot's photo. Maps to `photo_url` in 0001_init.sql. */
  photoUrl?: string;
  /** Read cue on the pin (pin-revamp-spec.md section 2). Not persisted yet. */
  category?: SpotCategory;
}

/**
 * Number of distinct "I've been here" confirmations a spot needs before it
 * flips from Unconfirmed to Confirmed. Lives here, and only here -- nothing
 * else should inline the number 2.
 */
export const CONFIRMATION_THRESHOLD = 2;

export function isConfirmed(spot: Spot): boolean {
  return spot.confirmations >= CONFIRMATION_THRESHOLD;
}

/**
 * The account that dropped a spot, as embedded on `spot_cards` rows
 * (social-spots.md "Types"). `avatarUrl` is `null` until the account
 * uploads one -- `Avatar` renders initials in that case.
 */
export interface SpotAuthor {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * A `Spot` plus its author and, when the source query provides one (e.g.
 * `feedCerca`), the caller's distance to it in meters.
 */
export interface SpotCard extends Spot {
  author: SpotAuthor;
  distanceM?: number;
  /** Photo attribution line (preview spots only -- user uploads carry none). */
  photoCredit?: string;
}

/** Why a spot appears on the caller's personal map (`my_map()`). */
/**
 * Why a spot is on Mi mapa. `preview` is client-only (src/lib/preview-
 * spots.ts): never returned by `my_map()`, never filterable via the legend.
 */
export type MapSource = "mine" | "saved" | "been" | "preview";

/** A `SpotCard` tagged with why it's on the caller's personal map. */
export interface MapSpot extends SpotCard {
  source: MapSource;
}

/** One real, recognizable seed spot for this milestone: Fort Pilar. */
export const SEED_SPOTS: readonly Spot[] = [
  {
    id: "fort-pilar",
    name: "Fort Pilar",
    note: "Historic 17th-century fort and shrine right by the water, worth a quiet walk at sunset.",
    lat: 6.9098,
    lng: 122.079,
    status: "unconfirmed",
    confirmations: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    nickname: "chabelita",
  },
];

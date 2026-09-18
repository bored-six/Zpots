/** A spot is Unconfirmed until enough distinct people vouch for it. */
export type SpotStatus = "unconfirmed" | "confirmed";

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

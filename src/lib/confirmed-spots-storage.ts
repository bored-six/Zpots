/**
 * Local bookkeeping for "spots this browser has already confirmed" --
 * `confirmedByMe` on `ConfirmButton` is not served by the schema (spec F9:
 * exposing it would require anon SELECT on `public.confirmations`, which
 * would publish every confirmer id). This module owns that bookkeeping at
 * the wiring layer instead, next to `getLocalConfirmerId` in spirit but
 * kept separate since `local-identity.ts` is a frozen contract.
 */

const STORAGE_KEY = "zpots:confirmed-spots";

/** In-memory fallback for SSR / sandboxed iframes / storage that throws. */
let memoryFallback: Set<string> = new Set();

/** Bare global access (not `window.localStorage`), same reasoning as local-identity.ts. */
function readLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function parseStoredIds(raw: string | null): Set<string> {
  if (!raw) return new Set();

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((value): value is string => typeof value === "string"));
    }
  } catch {
    // Corrupted/hand-edited value -- treat as "nothing recorded" rather than throwing.
  }

  return new Set();
}

/** Every spot id this browser has successfully confirmed, best-effort. */
export function getLocallyConfirmedSpotIds(): Set<string> {
  const storage = readLocalStorage();

  if (storage) {
    try {
      return parseStoredIds(storage.getItem(STORAGE_KEY));
    } catch {
      // Falls through to the in-memory fallback below.
    }
  }

  return new Set(memoryFallback);
}

/**
 * Records that this browser confirmed `spotId`, so a later render can pass
 * `confirmedByMe: true` to `ConfirmButton`. Call this only after
 * `confirmSpot` resolves successfully.
 */
export function markSpotConfirmedLocally(spotId: string): void {
  const storage = readLocalStorage();

  if (storage) {
    try {
      const ids = parseStoredIds(storage.getItem(STORAGE_KEY));
      ids.add(spotId);
      storage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
      return;
    } catch {
      // Quota exceeded / sandboxed iframe -- fall through to memory below.
    }
  }

  memoryFallback = new Set(memoryFallback);
  memoryFallback.add(spotId);
}

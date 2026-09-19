import { generateUuid } from "@/lib/uuid";

export const CONFIRMER_ID_STORAGE_KEY = "zpots:confirmer-id";
const STORAGE_KEY = CONFIRMER_ID_STORAGE_KEY;

// Matches the `confirmer_id` CHECK constraint on public.confirmations in
// 0001_init.sql: 8-64 chars, [A-Za-z0-9_-] only. A hand-edited or corrupted
// stored value that fails this can never trigger a 23514 on confirm,
// because we regenerate instead of sending it.
const VALID_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

let cachedId: string | null = null;

function isValidStoredId(value: string | null): value is string {
  return value !== null && VALID_ID_PATTERN.test(value);
}

/** Bare global access (not `window.localStorage`), wrapped for SSR/sandboxed iframes/private mode. */
function readLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns a stable, browser-local id used to record "who" confirmed a
 * spot. There are no accounts -- this is spoofable by design
 * (product.md). If localStorage is unavailable or throws, an in-memory id
 * is used for the session only: that browser is "a new person" every
 * reload, which is consistent with the accepted spoofability tradeoff.
 */
export function getLocalConfirmerId(): string {
  if (cachedId) return cachedId;

  const storage = readLocalStorage();

  if (storage) {
    try {
      const stored = storage.getItem(STORAGE_KEY);
      if (isValidStoredId(stored)) {
        cachedId = stored;
        return cachedId;
      }
    } catch {
      // Falls through to generating a fresh, unpersisted id below.
    }
  }

  const id = generateUuid();
  cachedId = id;

  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, id);
    } catch {
      // Quota exceeded / sandboxed iframe -- id still works for this
      // session, it just won't survive a reload.
    }
  }

  return id;
}

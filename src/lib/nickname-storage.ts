/**
 * Local storage for the optional, purely cosmetic nickname (product.md:
 * "never a verified identity anywhere in the UI"). Same
 * read/throw-safe/SSR-safe pattern as local-identity.ts and
 * confirmed-spots-storage.ts.
 */

import { MAX_NICKNAME_LENGTH } from "@/lib/validation";

const STORAGE_KEY = "zpots:nickname";

/** Reuses validation.ts's constant rather than redefining the number. */
export const MAX_STORED_NICKNAME_LENGTH = MAX_NICKNAME_LENGTH;

/** Bare global access (not `window.localStorage`), same reasoning as local-identity.ts. */
function readLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The stored nickname, or '' if nothing is stored / storage is unavailable. */
export function getStoredNickname(): string {
  const storage = readLocalStorage();
  if (!storage) return "";

  try {
    return storage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * Trims the value before storing. Silently no-ops (does not throw, does
 * not truncate) if the trimmed value is over MAX_STORED_NICKNAME_LENGTH --
 * callers (e.g. a form) are expected to have already validated against
 * validation.ts before calling this; this is a defensive backstop only.
 */
export function setStoredNickname(value: string): void {
  const trimmed = value.trim();
  if (trimmed.length > MAX_STORED_NICKNAME_LENGTH) return;

  const storage = readLocalStorage();
  if (!storage) return;

  try {
    storage.setItem(STORAGE_KEY, trimmed);
  } catch {
    // Quota exceeded / sandboxed iframe -- nothing further to do.
  }
}

/** Removes the stored nickname, back to ''. */
export function clearStoredNickname(): void {
  const storage = readLocalStorage();
  if (!storage) return;

  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Sandboxed iframe / SecurityError -- nothing further to do.
  }
}

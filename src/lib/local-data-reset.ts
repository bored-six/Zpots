/**
 * Clears every piece of local, browser-scoped state Zpots keeps: the
 * nickname, the confirmed-spots bookkeeping set, and the confirmer id
 * itself. Used by the Settings page's "clear my local data" control.
 *
 * Imports the real exported storage keys (rather than duplicating the
 * string literals) so this stays correct if either module's key ever
 * changes.
 */

import { CONFIRMED_SPOTS_STORAGE_KEY } from "@/lib/confirmed-spots-storage";
import { CONFIRMER_ID_STORAGE_KEY } from "@/lib/local-identity";
import { clearStoredNickname } from "@/lib/nickname-storage";

/** Bare global access (not `window.localStorage`), same reasoning as the other storage modules. */
function readLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function clearAllLocalData(): void {
  clearStoredNickname();

  const storage = readLocalStorage();
  if (!storage) return;

  try {
    storage.removeItem(CONFIRMED_SPOTS_STORAGE_KEY);
    storage.removeItem(CONFIRMER_ID_STORAGE_KEY);
  } catch {
    // Sandboxed iframe / SecurityError -- nothing further to do.
  }
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Minimal in-memory Storage stand-in, same pattern as
 * local-identity.test.ts / confirmed-spots-storage.test.ts /
 * nickname-storage.test.ts -- we stub the *global* rather than jsdom's real
 * localStorage so "nothing stored yet" vs "already stored" is fully
 * controlled and two fake stores never bleed into each other.
 */
function createFakeLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clearAllLocalData", () => {
  it("clears the nickname, the confirmed-spots set, and the confirmer id in one call", async () => {
    const sharedStorage = createFakeLocalStorage();
    vi.stubGlobal("localStorage", sharedStorage);

    const { setStoredNickname, getStoredNickname } = await import("@/lib/nickname-storage");
    const { markSpotConfirmedLocally, getLocallyConfirmedSpotIds } = await import(
      "@/lib/confirmed-spots-storage"
    );
    const { getLocalConfirmerId } = await import("@/lib/local-identity");
    const { clearAllLocalData } = await import("@/lib/local-data-reset");

    setStoredNickname("Kuya Ben");
    markSpotConfirmedLocally("spot-1");
    const idBeforeClear = getLocalConfirmerId();

    // Sanity check the pre-clear state actually took effect before we
    // assert the clear undid it.
    expect(getStoredNickname()).toBe("Kuya Ben");
    expect(getLocallyConfirmedSpotIds().has("spot-1")).toBe(true);
    expect(idBeforeClear.length).toBeGreaterThan(0);

    clearAllLocalData();

    expect(getStoredNickname()).toBe("");
    expect(Array.from(getLocallyConfirmedSpotIds())).toEqual([]);

    // Proves the identity key was actually removed from storage, not just
    // re-read as the same cached value: a fresh module load against the
    // same underlying (now-cleared) storage must mint a brand-new id.
    vi.resetModules();
    vi.stubGlobal("localStorage", sharedStorage);
    const { getLocalConfirmerId: getLocalConfirmerIdAfterReload } = await import(
      "@/lib/local-identity"
    );
    const idAfterClear = getLocalConfirmerIdAfterReload();

    expect(idAfterClear).not.toBe(idBeforeClear);
  });

  it("does not throw when called with nothing ever stored", async () => {
    vi.stubGlobal("localStorage", createFakeLocalStorage());

    const { clearAllLocalData } = await import("@/lib/local-data-reset");

    expect(() => clearAllLocalData()).not.toThrow();
  });

  it("leaves all three stores empty even when called twice in a row", async () => {
    vi.stubGlobal("localStorage", createFakeLocalStorage());

    const { setStoredNickname, getStoredNickname } = await import("@/lib/nickname-storage");
    const { markSpotConfirmedLocally, getLocallyConfirmedSpotIds } = await import(
      "@/lib/confirmed-spots-storage"
    );
    const { clearAllLocalData } = await import("@/lib/local-data-reset");

    setStoredNickname("Kuya Ben");
    markSpotConfirmedLocally("spot-1");

    clearAllLocalData();
    expect(() => clearAllLocalData()).not.toThrow();

    expect(getStoredNickname()).toBe("");
    expect(getLocallyConfirmedSpotIds().size).toBe(0);
  });
});

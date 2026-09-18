import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Minimal in-memory Storage stand-in, same pattern as
 * local-identity.test.ts -- we stub the *global* rather than jsdom's real
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

describe("getLocallyConfirmedSpotIds", () => {
  it("returns an empty set when nothing has been recorded", async () => {
    vi.stubGlobal("localStorage", createFakeLocalStorage());

    const { getLocallyConfirmedSpotIds } = await import("@/lib/confirmed-spots-storage");
    const ids = getLocallyConfirmedSpotIds();

    expect(ids.size).toBe(0);
  });

  it("returns previously marked ids after a fresh module load against the same storage (simulates reload)", async () => {
    const sharedStorage = createFakeLocalStorage();
    vi.stubGlobal("localStorage", sharedStorage);

    const firstLoad = await import("@/lib/confirmed-spots-storage");
    firstLoad.markSpotConfirmedLocally("spot-1");

    vi.resetModules();
    vi.stubGlobal("localStorage", sharedStorage);

    const secondLoad = await import("@/lib/confirmed-spots-storage");
    const ids = secondLoad.getLocallyConfirmedSpotIds();

    expect(ids.has("spot-1")).toBe(true);
  });

  it("accumulates multiple marked ids without dropping earlier ones", async () => {
    vi.stubGlobal("localStorage", createFakeLocalStorage());

    const { getLocallyConfirmedSpotIds, markSpotConfirmedLocally } = await import(
      "@/lib/confirmed-spots-storage"
    );

    markSpotConfirmedLocally("spot-1");
    markSpotConfirmedLocally("spot-2");

    const ids = getLocallyConfirmedSpotIds();
    expect(ids.has("spot-1")).toBe(true);
    expect(ids.has("spot-2")).toBe(true);
    expect(ids.size).toBe(2);
  });

  it("marking the same id twice does not create a duplicate", async () => {
    vi.stubGlobal("localStorage", createFakeLocalStorage());

    const { getLocallyConfirmedSpotIds, markSpotConfirmedLocally } = await import(
      "@/lib/confirmed-spots-storage"
    );

    markSpotConfirmedLocally("spot-1");
    markSpotConfirmedLocally("spot-1");

    expect(getLocallyConfirmedSpotIds().size).toBe(1);
  });

  it("recovers gracefully from corrupted (non-JSON) stored data instead of throwing", async () => {
    const storage = createFakeLocalStorage();
    storage.setItem("zpots:confirmed-spots", "{not valid json");
    vi.stubGlobal("localStorage", storage);

    const { getLocallyConfirmedSpotIds } = await import("@/lib/confirmed-spots-storage");

    expect(() => getLocallyConfirmedSpotIds()).not.toThrow();
    expect(getLocallyConfirmedSpotIds().size).toBe(0);
  });

  it("ignores non-string entries in corrupted-but-valid-JSON stored data", async () => {
    const storage = createFakeLocalStorage();
    storage.setItem("zpots:confirmed-spots", JSON.stringify(["spot-1", 42, null, "spot-2"]));
    vi.stubGlobal("localStorage", storage);

    const { getLocallyConfirmedSpotIds } = await import("@/lib/confirmed-spots-storage");
    const ids = getLocallyConfirmedSpotIds();

    expect(ids).toEqual(new Set(["spot-1", "spot-2"]));
  });

  it("does not throw and still returns a Set when localStorage is unavailable", async () => {
    vi.stubGlobal("localStorage", undefined);

    const { getLocallyConfirmedSpotIds, markSpotConfirmedLocally } = await import(
      "@/lib/confirmed-spots-storage"
    );

    expect(() => markSpotConfirmedLocally("spot-1")).not.toThrow();
    expect(() => getLocallyConfirmedSpotIds()).not.toThrow();
    expect(getLocallyConfirmedSpotIds()).toBeInstanceOf(Set);
  });

  it("does not throw when localStorage.getItem/setItem throw (sandboxed iframe / private mode)", async () => {
    const throwingStorage: Storage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    };
    vi.stubGlobal("localStorage", throwingStorage);

    const { getLocallyConfirmedSpotIds, markSpotConfirmedLocally } = await import(
      "@/lib/confirmed-spots-storage"
    );

    expect(() => markSpotConfirmedLocally("spot-1")).not.toThrow();
    expect(() => getLocallyConfirmedSpotIds()).not.toThrow();
  });
});

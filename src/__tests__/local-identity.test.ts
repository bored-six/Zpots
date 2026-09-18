import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Minimal in-memory Storage stand-in. We stub the *global* rather than
 * relying on jsdom's real localStorage so we have full control over what
 * "nothing stored yet" vs "already stored" looks like, and so two
 * independent fake stores never accidentally share state.
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

describe("getLocalConfirmerId", () => {
  it("generates a non-empty id and persists something when nothing is stored yet", async () => {
    const fakeStorage = createFakeLocalStorage();
    vi.stubGlobal("localStorage", fakeStorage);
    expect(fakeStorage.length).toBe(0);

    const { getLocalConfirmerId } = await import("@/lib/local-identity");
    const id = getLocalConfirmerId();

    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
    // Something must have been written so a future call can find it.
    expect(fakeStorage.length).toBeGreaterThan(0);
  });

  it("returns the same id on a second call within the same module instance", async () => {
    vi.stubGlobal("localStorage", createFakeLocalStorage());

    const { getLocalConfirmerId } = await import("@/lib/local-identity");
    const first = getLocalConfirmerId();
    const second = getLocalConfirmerId();

    expect(second).toBe(first);
  });

  it("returns the previously stored id after a fresh module load against the same underlying storage (simulates a page reload)", async () => {
    const sharedFakeStorage = createFakeLocalStorage();
    vi.stubGlobal("localStorage", sharedFakeStorage);

    const firstLoad = await import("@/lib/local-identity");
    const first = firstLoad.getLocalConfirmerId();

    // Force a fresh module instance (no in-memory module cache carried
    // over) while keeping the exact same backing store, the way a real
    // page reload would keep localStorage but reset all JS state.
    vi.resetModules();
    vi.stubGlobal("localStorage", sharedFakeStorage);

    const secondLoad = await import("@/lib/local-identity");
    const second = secondLoad.getLocalConfirmerId();

    expect(second).toBe(first);
  });

  it("generates different ids across two independent fresh storages (not a hardcoded constant)", async () => {
    vi.stubGlobal("localStorage", createFakeLocalStorage());
    const moduleA = await import("@/lib/local-identity");
    const idA = moduleA.getLocalConfirmerId();

    vi.resetModules();
    vi.stubGlobal("localStorage", createFakeLocalStorage());
    const moduleB = await import("@/lib/local-identity");
    const idB = moduleB.getLocalConfirmerId();

    expect(idA).not.toBe(idB);
  });
});

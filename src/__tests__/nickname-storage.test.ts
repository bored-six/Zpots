import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_NICKNAME_LENGTH } from "@/lib/validation";

/**
 * Minimal in-memory Storage stand-in, same pattern as
 * local-identity.test.ts / confirmed-spots-storage.test.ts -- we stub the
 * *global* rather than jsdom's real localStorage so "nothing stored yet"
 * vs "already stored" is fully controlled and two fake stores never bleed
 * into each other.
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

describe("MAX_STORED_NICKNAME_LENGTH", () => {
  it("reuses validation.ts's MAX_NICKNAME_LENGTH rather than redefining the number", async () => {
    vi.stubGlobal("localStorage", createFakeLocalStorage());

    const { MAX_STORED_NICKNAME_LENGTH } = await import("@/lib/nickname-storage");

    expect(MAX_STORED_NICKNAME_LENGTH).toBe(MAX_NICKNAME_LENGTH);
  });
});

describe("getStoredNickname", () => {
  it("returns '' when nothing has been stored", async () => {
    vi.stubGlobal("localStorage", createFakeLocalStorage());

    const { getStoredNickname } = await import("@/lib/nickname-storage");

    expect(getStoredNickname()).toBe("");
  });

  it("returns '' when localStorage is unavailable", async () => {
    vi.stubGlobal("localStorage", undefined);

    const { getStoredNickname } = await import("@/lib/nickname-storage");

    expect(() => getStoredNickname()).not.toThrow();
    expect(getStoredNickname()).toBe("");
  });

  it("does not throw and falls back to '' when localStorage.getItem throws (sandboxed iframe / private mode)", async () => {
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

    const { getStoredNickname } = await import("@/lib/nickname-storage");

    expect(() => getStoredNickname()).not.toThrow();
    expect(getStoredNickname()).toBe("");
  });
});

describe("setStoredNickname / getStoredNickname round-trip", () => {
  it("set then get round-trips the exact value", async () => {
    vi.stubGlobal("localStorage", createFakeLocalStorage());

    const { setStoredNickname, getStoredNickname } = await import("@/lib/nickname-storage");
    setStoredNickname("Kuya Ben");

    expect(getStoredNickname()).toBe("Kuya Ben");
  });

  it("trims surrounding whitespace before storing", async () => {
    vi.stubGlobal("localStorage", createFakeLocalStorage());

    const { setStoredNickname, getStoredNickname } = await import("@/lib/nickname-storage");
    setStoredNickname("   Ate Joy   ");

    expect(getStoredNickname()).toBe("Ate Joy");
  });

  it("persists across a fresh module load against the same underlying storage (simulates a page reload)", async () => {
    const sharedStorage = createFakeLocalStorage();
    vi.stubGlobal("localStorage", sharedStorage);

    const firstLoad = await import("@/lib/nickname-storage");
    firstLoad.setStoredNickname("Tatay Rey");

    vi.resetModules();
    vi.stubGlobal("localStorage", sharedStorage);

    const secondLoad = await import("@/lib/nickname-storage");
    expect(secondLoad.getStoredNickname()).toBe("Tatay Rey");
  });

  // Caller-validation assumption: setStoredNickname is documented as
  // assuming the caller (e.g. a form) has already validated the nickname
  // against MAX_NICKNAME_LENGTH via validation.ts before calling this. The
  // over-length no-op below is a defensive backstop, not the primary
  // validation path -- it silently refuses to persist bad data rather than
  // throwing or truncating, so a caller that skips validation fails quietly
  // instead of corrupting storage.
  it("silently no-ops (does not throw, does not truncate) when set with nothing previously stored and the trimmed value is over the max length", async () => {
    vi.stubGlobal("localStorage", createFakeLocalStorage());

    const { setStoredNickname, getStoredNickname } = await import("@/lib/nickname-storage");
    const tooLong = "x".repeat(MAX_NICKNAME_LENGTH + 1);

    expect(() => setStoredNickname(`  ${tooLong}  `)).not.toThrow();
    expect(getStoredNickname()).toBe("");
  });

  it("silently no-ops and leaves a previously stored valid value unchanged when set with an over-length value", async () => {
    vi.stubGlobal("localStorage", createFakeLocalStorage());

    const { setStoredNickname, getStoredNickname } = await import("@/lib/nickname-storage");
    setStoredNickname("Nanay Cristy");

    const tooLong = "y".repeat(MAX_NICKNAME_LENGTH + 1);
    expect(() => setStoredNickname(tooLong)).not.toThrow();

    expect(getStoredNickname()).toBe("Nanay Cristy");
  });

  it("accepts a trimmed value at exactly the max length (boundary, not over)", async () => {
    vi.stubGlobal("localStorage", createFakeLocalStorage());

    const { setStoredNickname, getStoredNickname } = await import("@/lib/nickname-storage");
    const exactlyMax = "z".repeat(MAX_NICKNAME_LENGTH);

    setStoredNickname(exactlyMax);

    expect(getStoredNickname()).toBe(exactlyMax);
  });

  it("does not throw when localStorage.setItem throws (sandboxed iframe / private mode / quota exceeded)", async () => {
    const throwingStorage: Storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    };
    vi.stubGlobal("localStorage", throwingStorage);

    const { setStoredNickname } = await import("@/lib/nickname-storage");

    expect(() => setStoredNickname("Kuya Ben")).not.toThrow();
  });
});

describe("clearStoredNickname", () => {
  it("removes a previously stored nickname, back to ''", async () => {
    vi.stubGlobal("localStorage", createFakeLocalStorage());

    const { setStoredNickname, clearStoredNickname, getStoredNickname } = await import(
      "@/lib/nickname-storage"
    );
    setStoredNickname("Kuya Ben");
    expect(getStoredNickname()).toBe("Kuya Ben");

    clearStoredNickname();

    expect(getStoredNickname()).toBe("");
  });

  it("does not throw when called with nothing ever stored", async () => {
    vi.stubGlobal("localStorage", createFakeLocalStorage());

    const { clearStoredNickname } = await import("@/lib/nickname-storage");

    expect(() => clearStoredNickname()).not.toThrow();
  });

  it("does not throw when localStorage.removeItem throws", async () => {
    const throwingStorage: Storage = {
      getItem: () => "Kuya Ben",
      setItem: () => {},
      removeItem: () => {
        throw new Error("SecurityError");
      },
      clear: () => {},
      key: () => null,
      length: 0,
    };
    vi.stubGlobal("localStorage", throwingStorage);

    const { clearStoredNickname } = await import("@/lib/nickname-storage");

    expect(() => clearStoredNickname()).not.toThrow();
  });
});

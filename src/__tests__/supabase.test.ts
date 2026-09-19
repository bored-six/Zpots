import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

// Snapshot whatever real values .env.local supplied so we can restore them
// after each test -- this module reads env vars at call time, and we don't
// want to leak fake test values into other test files in the same run.
const originalUrl = process.env[URL_KEY];
const originalAnonKey = process.env[ANON_KEY];

function restoreEnv() {
  if (originalUrl === undefined) delete process.env[URL_KEY];
  else process.env[URL_KEY] = originalUrl;

  if (originalAnonKey === undefined) delete process.env[ANON_KEY];
  else process.env[ANON_KEY] = originalAnonKey;
}

describe("getSupabaseClient", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("returns a truthy client when both env vars are present", async () => {
    process.env[URL_KEY] = "https://example.supabase.co";
    process.env[ANON_KEY] = "test-anon-key";

    const { getSupabaseClient } = await import("@/lib/supabase");
    const client = getSupabaseClient();

    expect(client).toBeTruthy();
  });

  it("returns the exact same instance on a second call (singleton)", async () => {
    process.env[URL_KEY] = "https://example.supabase.co";
    process.env[ANON_KEY] = "test-anon-key";

    const { getSupabaseClient } = await import("@/lib/supabase");
    const first = getSupabaseClient();
    const second = getSupabaseClient();

    expect(first).toBe(second);
  });

  it("throws when NEXT_PUBLIC_SUPABASE_URL is missing", async () => {
    delete process.env[URL_KEY];
    process.env[ANON_KEY] = "test-anon-key";

    const { getSupabaseClient } = await import("@/lib/supabase");
    expect(() => getSupabaseClient()).toThrow();
  });

  it("throws when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing", async () => {
    process.env[URL_KEY] = "https://example.supabase.co";
    delete process.env[ANON_KEY];

    const { getSupabaseClient } = await import("@/lib/supabase");
    expect(() => getSupabaseClient()).toThrow();
  });

  it("throws when both env vars are missing", async () => {
    delete process.env[URL_KEY];
    delete process.env[ANON_KEY];

    const { getSupabaseClient } = await import("@/lib/supabase");
    expect(() => getSupabaseClient()).toThrow();
  });

  it("throws when the URL env var is present but empty string (not just undefined)", async () => {
    // Not explicitly listed -- an empty string is falsy but `!== undefined`,
    // a naive `if (url === undefined)` guard would wrongly accept this.
    process.env[URL_KEY] = "";
    process.env[ANON_KEY] = "test-anon-key";

    const { getSupabaseClient } = await import("@/lib/supabase");
    expect(() => getSupabaseClient()).toThrow();
  });

  it("creates the client with persistSession/autoRefreshToken on and detectSessionInUrl off (auth migration D1/1.3)", async () => {
    process.env[URL_KEY] = "https://example.supabase.co";
    process.env[ANON_KEY] = "test-anon-key";

    vi.doMock("@supabase/supabase-js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@supabase/supabase-js")>();
      return { ...actual, createClient: vi.fn(actual.createClient) };
    });

    const { createClient } = await import("@supabase/supabase-js");
    const { getSupabaseClient } = await import("@/lib/supabase");
    getSupabaseClient();

    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "test-anon-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        }),
      }),
    );

    vi.doUnmock("@supabase/supabase-js");
  });
});

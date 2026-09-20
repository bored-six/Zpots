import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpotCard } from "@/lib/spots";

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUserId: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import { getSupabaseClient } from "@/lib/supabase";
import { getCurrentUser, requireUserId } from "@/lib/auth";
import { createFakeSupabase } from "@/__tests__/helpers/fake-supabase";
import { feedCerca, feedNuevo, feedSiguiendo, hoyRow, spotsByUser } from "@/lib/feed-repo";

function cardRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "spot-1",
    name: "Fort Pilar",
    note: "Historic fort.",
    lat: 6.9098,
    lng: 122.079,
    status: "unconfirmed",
    confirmations: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    photo_url: "https://cdn.example.com/fort.jpg",
    created_by: "user-2",
    handle: "kuya_ben",
    display_name: "Kuya Ben",
    avatar_url: null,
    ...overrides,
  };
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) so a mockResolvedValueOnce queued by
  // one test can never leak into the next test's first call -- clearAllMocks
  // wipes call history but leaves queued once-implementations in place.
  vi.resetAllMocks();
  vi.mocked(requireUserId).mockResolvedValue("user-1");
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1", email: "a@b.com", nickname: "" });
});

// ---------------------------------------------------------------------------
// feedCerca
// ---------------------------------------------------------------------------
describe("feedCerca", () => {
  it("calls rpc('feed_cerca', { origin_lat, origin_lng, page_size, page_offset }) with default paging on the first page", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    await feedCerca(6.91, 122.07);

    expect(rpcMock).toHaveBeenCalledWith(
      "feed_cerca",
      expect.objectContaining({ origin_lat: 6.91, origin_lng: 122.07, page_size: 10, page_offset: 0 }),
    );
  });

  it("forwards a custom pageSize/pageOffset", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    await feedCerca(6.91, 122.07, 5, 20);

    expect(rpcMock).toHaveBeenCalledWith(
      "feed_cerca",
      expect.objectContaining({ page_size: 5, page_offset: 20 }),
    );
  });

  it("maps distance_m onto distanceM alongside the nested author", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: [cardRow({ distance_m: 842.5 })], error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    const result = await feedCerca(6.91, 122.07);

    expect(result[0]).toMatchObject<Partial<SpotCard>>({
      id: "spot-1",
      distanceM: 842.5,
      author: { id: "user-2", handle: "kuya_ben", displayName: "Kuya Ben", avatarUrl: null },
    });
  });

  it("is public -- never calls requireUserId", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    await feedCerca(6.91, 122.07);

    expect(requireUserId).not.toHaveBeenCalled();
  });

  it("rejects when the rpc call errors", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    await expect(feedCerca(6.91, 122.07)).rejects.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// feedNuevo -- keyset pagination on (created_at, id)
// ---------------------------------------------------------------------------
describe("feedNuevo", () => {
  it("sends null cursor fields on the first page (no cursor argument)", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    await feedNuevo();

    expect(rpcMock).toHaveBeenCalledWith(
      "feed_nuevo",
      expect.objectContaining({ page_size: 10, before_created_at: null, before_id: null }),
    );
  });

  it("forwards the cursor's createdAt/id as before_created_at/before_id on later pages", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    await feedNuevo(10, { createdAt: "2026-01-05T00:00:00.000Z", id: "spot-9" });

    expect(rpcMock).toHaveBeenCalledWith(
      "feed_nuevo",
      expect.objectContaining({
        before_created_at: "2026-01-05T00:00:00.000Z",
        before_id: "spot-9",
      }),
    );
  });

  it("does not attach a distanceM when the function doesn't provide one", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: [cardRow()], error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    const result = await feedNuevo();

    expect(result[0].distanceM).toBeUndefined();
  });

  it("is readable while signed out", async () => {
    // mockResolvedValue (not Once) -- a queued once-value here has nothing
    // to do with this test's identity-independent behavior and would only
    // risk leaking into whichever test runs next.
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const rpcMock = vi.fn().mockResolvedValue({ data: [cardRow()], error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    await expect(feedNuevo()).resolves.toHaveLength(1);
  });

  it("never calls getCurrentUser -- feed_nuevo is a public read with no identity scoping", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    await feedNuevo();

    expect(getCurrentUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// feedSiguiendo -- same paging shape, but scoped to my followees
// ---------------------------------------------------------------------------
describe("feedSiguiendo", () => {
  it("resolves an empty array with no client call when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const rpcMock = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    const result = await feedSiguiendo();

    expect(result).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("calls rpc('feed_siguiendo', ...) with the same cursor shape as feed_nuevo when signed in", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    await feedSiguiendo(10, { createdAt: "2026-01-05T00:00:00.000Z", id: "spot-9" });

    expect(rpcMock).toHaveBeenCalledWith(
      "feed_siguiendo",
      expect.objectContaining({
        page_size: 10,
        before_created_at: "2026-01-05T00:00:00.000Z",
        before_id: "spot-9",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// hoyRow -- followees with a spot in the last 24h
// ---------------------------------------------------------------------------
describe("hoyRow", () => {
  it("resolves an empty array with no client call when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const rpcMock = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    const result = await hoyRow();

    expect(result).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("calls rpc('hoy_row') and maps each row to { spotId, author }", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: [{ spot_id: "spot-1", handle: "kuya_ben", display_name: "Kuya Ben", avatar_url: null, id: "user-2" }],
      error: null,
    });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    const result = await hoyRow();

    expect(rpcMock).toHaveBeenCalledWith("hoy_row", expect.anything());
    expect(result[0]).toMatchObject({
      spotId: "spot-1",
      author: { id: "user-2", handle: "kuya_ben", displayName: "Kuya Ben" },
    });
  });
});

// ---------------------------------------------------------------------------
// spotsByUser -- public profile grid, via the shared fake (spot_cards view)
// ---------------------------------------------------------------------------
describe("spotsByUser", () => {
  it("is public -- never calls requireUserId", async () => {
    const { client } = createFakeSupabase({ spot_cards: [cardRow({ created_by: "user-9" })] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await spotsByUser("user-9");

    expect(requireUserId).not.toHaveBeenCalled();
  });

  it("returns only that user's cards, newest first", async () => {
    const { client } = createFakeSupabase({
      spot_cards: [
        cardRow({ id: "spot-1", created_by: "user-9", created_at: "2026-01-01T00:00:00.000Z" }),
        cardRow({ id: "spot-2", created_by: "user-9", created_at: "2026-01-03T00:00:00.000Z" }),
        cardRow({ id: "spot-3", created_by: "someone-else", created_at: "2026-01-02T00:00:00.000Z" }),
      ],
    });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    const result = await spotsByUser("user-9");

    expect(result.map((r) => r.id)).toEqual(["spot-2", "spot-1"]);
  });
});

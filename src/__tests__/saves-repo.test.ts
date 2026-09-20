import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MapSpot } from "@/lib/spots";

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
import { saveSpot, unsaveSpot, mySavedIds, myMap } from "@/lib/saves-repo";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUserId).mockResolvedValue("user-1");
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1", email: "a@b.com", nickname: "" });
});

function authRequiredError() {
  return Object.assign(new Error("Sign in to continue."), { cause: { code: "auth_required" } });
}

// ---------------------------------------------------------------------------
// saveSpot
// ---------------------------------------------------------------------------
describe("saveSpot", () => {
  it("signed out: rejects before any insert", async () => {
    vi.mocked(requireUserId).mockRejectedValueOnce(authRequiredError());
    const { client, calls } = createFakeSupabase({ saves: [] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(saveSpot("spot-1")).rejects.toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it("inserts exactly { user_id, spot_id }", async () => {
    const { client, calls } = createFakeSupabase({ saves: [] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await saveSpot("spot-1");

    const insertCall = calls.find((c) => c.table === "saves" && c.method === "insert");
    expect(insertCall?.args[0]).toEqual({ user_id: "user-1", spot_id: "spot-1" });
  });

  it("is idempotent -- saving the same spot twice does not throw and leaves one row", async () => {
    const { client, db } = createFakeSupabase({ saves: [] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await saveSpot("spot-1");
    await expect(saveSpot("spot-1")).resolves.not.toThrow();

    const rows = db.saves.filter((r) => r.user_id === "user-1" && r.spot_id === "spot-1");
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// unsaveSpot
// ---------------------------------------------------------------------------
describe("unsaveSpot", () => {
  it("signed out: rejects before any delete", async () => {
    vi.mocked(requireUserId).mockRejectedValueOnce(authRequiredError());
    const { client, calls } = createFakeSupabase({ saves: [{ user_id: "user-1", spot_id: "spot-1" }] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(unsaveSpot("spot-1")).rejects.toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it("is idempotent -- unsaving a spot you never saved does not throw", async () => {
    const { client } = createFakeSupabase({ saves: [] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(unsaveSpot("spot-1")).resolves.not.toThrow();
  });

  it("removes only the calling user's row for that spot, leaving other users' saves intact", async () => {
    const { client, db } = createFakeSupabase({
      saves: [
        { user_id: "user-1", spot_id: "spot-1" },
        { user_id: "user-2", spot_id: "spot-1" },
      ],
    });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await unsaveSpot("spot-1");

    expect(db.saves).toEqual([{ user_id: "user-2", spot_id: "spot-1" }]);
  });
});

// ---------------------------------------------------------------------------
// mySavedIds
// ---------------------------------------------------------------------------
describe("mySavedIds", () => {
  it("resolves an empty set with no client call when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const fromMock = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    const result = await mySavedIds();

    expect(result).toEqual(new Set());
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("resolves a set of spot_ids from select('spot_id') when signed in", async () => {
    const selectMock = vi
      .fn()
      .mockReturnValue(Promise.resolve({ data: [{ spot_id: "spot-1" }, { spot_id: "spot-2" }], error: null }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    const result = await mySavedIds();

    expect(result).toEqual(new Set(["spot-1", "spot-2"]));
    expect(selectMock).toHaveBeenCalledWith("spot_id");
  });

  it("rejects when the client reports an error", async () => {
    const selectMock = vi
      .fn()
      .mockReturnValue(Promise.resolve({ data: null, error: { message: "network error" } }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    await expect(mySavedIds()).rejects.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// myMap
// ---------------------------------------------------------------------------
function mapRow(overrides: Partial<Record<string, unknown>> = {}) {
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
    source: "saved",
    ...overrides,
  };
}

describe("myMap", () => {
  it("resolves an empty array with no client call when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const rpcMock = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    const result = await myMap();

    expect(result).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("calls rpc('my_map') with no arguments (server scopes to the caller via RLS)", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    await myMap();

    expect(rpcMock).toHaveBeenCalledWith("my_map", expect.anything());
  });

  it("maps each row's source (mine/saved/been) through onto the returned MapSpot", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: [mapRow({ id: "spot-1", source: "mine" }), mapRow({ id: "spot-2", source: "been" })],
      error: null,
    });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    const result = await myMap();

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.source)).toEqual<MapSpot["source"][]>(["mine", "been"]);
    expect(result[0]).toMatchObject({
      id: "spot-1",
      author: { handle: "kuya_ben", displayName: "Kuya Ben" },
    });
  });

  it("resolves an empty array (not a throw) when the account has nothing on their map yet", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    await expect(myMap()).resolves.toEqual([]);
  });

  it("rejects when the rpc call itself errors", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    await expect(myMap()).rejects.toBeTruthy();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIRMATION_THRESHOLD, type Spot } from "@/lib/spots";
import type { NewSpotInput } from "@/lib/validation";

// The repo module is expected to call getSupabaseClient() from this module
// to reach the database, so we replace it with a fully mocked/fake client
// and never touch a real Supabase project.
vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn(),
}));

// Every write now calls requireUserId() first (D8) -- mock @/lib/auth so
// spots-repo never touches the real module (which would call the mocked
// supabase client's missing `.auth`).
vi.mock("@/lib/auth", () => ({
  requireUserId: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import { getSupabaseClient } from "@/lib/supabase";
import { getCurrentUser, requireUserId } from "@/lib/auth";
import { createFakeSupabase, makeSpotRow } from "@/__tests__/helpers/fake-supabase";
import {
  fetchSpots,
  createSpot,
  confirmSpot,
  reportSpot,
  fetchMyConfirmedSpotIds,
} from "@/lib/spots-repo";

function makeImageFile(name = "photo.jpg"): File {
  return new File([new Uint8Array(1024)], name, { type: "image/jpeg" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUserId).mockResolvedValue("user-uuid");
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: "user-uuid",
    email: "person@example.com",
    nickname: "",
  });
});

// ---------------------------------------------------------------------------
// fetchSpots
// ---------------------------------------------------------------------------
describe("fetchSpots", () => {
  it("resolves to the array of rows the client returns", async () => {
    const rows: Spot[] = [
      {
        id: "spot-1",
        name: "Fort Pilar",
        note: "Historic fort.",
        lat: 6.9098,
        lng: 122.079,
        status: "unconfirmed",
        confirmations: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const selectMock = vi.fn().mockReturnValue(Promise.resolve({ data: rows, error: null }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    const result = await fetchSpots();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "spot-1", name: "Fort Pilar" });
  });

  it("resolves to an empty array when there are no rows", async () => {
    const selectMock = vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    const result = await fetchSpots();

    expect(result).toEqual([]);
  });

  it("rejects when the client reports an error, instead of silently returning nothing", async () => {
    const selectMock = vi
      .fn()
      .mockReturnValue(Promise.resolve({ data: null, error: { message: "network error" } }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    await expect(fetchSpots()).rejects.toBeTruthy();
  });

  it("runs for signed-out visitors too (never calls requireUserId)", async () => {
    const selectMock = vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    await fetchSpots();

    expect(requireUserId).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createSpot
// ---------------------------------------------------------------------------
describe("createSpot", () => {
  const PUBLIC_URL = "https://cdn.example.com/spots/fake-photo.jpg";

  function makeUploadingClient(overrides?: {
    uploadResult?: unknown;
    insertResult?: unknown;
  }) {
    const uploadMock = vi
      .fn()
      .mockResolvedValue(overrides?.uploadResult ?? { data: { path: "spots/fake-photo.jpg" }, error: null });
    const getPublicUrlMock = vi.fn().mockReturnValue({ data: { publicUrl: PUBLIC_URL } });
    const storageFromMock = vi.fn(() => ({ upload: uploadMock, getPublicUrl: getPublicUrlMock }));

    const insertResult =
      overrides?.insertResult ??
      Promise.resolve({
        data: {
          id: "new-spot-1",
          name: "Test Spot",
          note: "A test note.",
          lat: 6.9,
          lng: 122.07,
          status: "unconfirmed",
          confirmations: 0,
          createdAt: "2026-01-05T00:00:00.000Z",
        },
        error: null,
      });
    const insertMock = vi.fn().mockReturnValue(insertResult);
    const fromMock = vi.fn(() => ({ insert: insertMock }));

    const client = { from: fromMock, storage: { from: storageFromMock } };
    return { client, uploadMock, getPublicUrlMock, insertMock, fromMock, storageFromMock };
  }

  const validNewSpot: NewSpotInput = {
    name: "Test Spot",
    note: "A test note.",
    lat: 6.9,
    lng: 122.07,
    photoFile: makeImageFile(),
  };

  it("uploads the photo before inserting a row, and the row carries status 'unconfirmed' and confirmations 0", async () => {
    const { client, uploadMock, insertMock } = makeUploadingClient();
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await createSpot(validNewSpot);

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(1);

    const insertedRow = insertMock.mock.calls[0][0];
    expect(insertedRow).toMatchObject({ status: "unconfirmed", confirmations: 0 });

    // Upload must have happened strictly before insert, not after / in parallel
    // without waiting.
    expect(uploadMock.mock.invocationCallOrder[0]).toBeLessThan(
      insertMock.mock.invocationCallOrder[0],
    );
  });

  it("stores the public URL returned by storage somewhere in the inserted row", async () => {
    const { client, insertMock } = makeUploadingClient();
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await createSpot(validNewSpot);

    const insertedRow = insertMock.mock.calls[0][0];
    expect(Object.values(insertedRow)).toContain(PUBLIC_URL);
  });

  it("never sends created_by -- the DB fills it from auth.uid()", async () => {
    const { client, insertMock } = makeUploadingClient();
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await createSpot(validNewSpot);

    const insertedRow = insertMock.mock.calls[0][0];
    expect(insertedRow).not.toHaveProperty("created_by");
  });

  it("resolves to the created spot", async () => {
    const { client } = makeUploadingClient();
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    const result = await createSpot(validNewSpot);

    expect(result).toMatchObject({ id: "new-spot-1", status: "unconfirmed", confirmations: 0 });
  });

  it("rejects and never calls insert when the photo upload fails", async () => {
    const { client, insertMock } = makeUploadingClient({
      uploadResult: { data: null, error: { message: "upload failed" } },
    });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(createSpot(validNewSpot)).rejects.toBeTruthy();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects when the insert itself fails", async () => {
    const { client } = makeUploadingClient({
      insertResult: Promise.resolve({ data: null, error: { message: "insert failed" } }),
    });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(createSpot(validNewSpot)).rejects.toBeTruthy();
  });

  it("rejects without ever touching storage when photoFile is null (defense in depth beyond form validation)", async () => {
    const { client, uploadMock } = makeUploadingClient();
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(createSpot({ ...validNewSpot, photoFile: null })).rejects.toBeTruthy();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("signed out: rejects and never calls storage.from (requireUserId is checked before any network call)", async () => {
    const authRequiredError = Object.assign(new Error("Sign in to continue."), {
      cause: { code: "auth_required" },
    });
    vi.mocked(requireUserId).mockRejectedValueOnce(authRequiredError);
    const { client, storageFromMock } = makeUploadingClient();
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(createSpot(validNewSpot)).rejects.toBeTruthy();
    expect(storageFromMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// confirmSpot
//
// D9: confirmSpot(spotId) takes exactly one argument now -- the confirmer
// identity comes from requireUserId(), not a caller-supplied parameter. The
// fake backend below still emulates a generic Postgres-style unique
// constraint: within any one table, a new inserted row is treated as a
// duplicate of an existing row if they share two or more identical scalar
// values (covers both a "select first, then insert" and an "insert and
// catch the unique violation" identity check without hardcoding which one
// the implementation picks).
// ---------------------------------------------------------------------------
/** Queues requireUserId() to resolve each id in order, one per call. */
function queueConfirmerIds(ids: string[]) {
  for (const id of ids) {
    vi.mocked(requireUserId).mockResolvedValueOnce(id);
  }
}

describe("confirmSpot", () => {
  it("has arity 1 -- confirmerId is no longer a parameter (D9)", () => {
    expect(confirmSpot.length).toBe(1);
  });

  it("does not increase confirmations when the same confirmer confirms the same spot twice", async () => {
    const spotRow = makeSpotRow();
    const { client, db } = createFakeSupabase({ spots: [spotRow] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);
    queueConfirmerIds(["confirmer-a", "confirmer-a"]);

    await confirmSpot("spot-1");
    await confirmSpot("spot-1");

    const finalRow = db.spots.find((r) => r.id === "spot-1");
    expect(finalRow?.confirmations).toBe(1);
  });

  it("increases confirmations for two distinct confirmers on the same spot", async () => {
    const spotRow = makeSpotRow();
    const { client, db } = createFakeSupabase({ spots: [spotRow] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);
    queueConfirmerIds(["confirmer-a", "confirmer-b"]);

    await confirmSpot("spot-1");
    await confirmSpot("spot-1");

    const finalRow = db.spots.find((r) => r.id === "spot-1");
    expect(finalRow?.confirmations).toBe(2);
  });

  it(`flips status to 'confirmed' only once confirmations reach CONFIRMATION_THRESHOLD (currently ${CONFIRMATION_THRESHOLD}), not before`, async () => {
    const spotRow = makeSpotRow();
    const { client, db } = createFakeSupabase({ spots: [spotRow] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    const confirmerIds = Array.from(
      { length: CONFIRMATION_THRESHOLD },
      (_, i) => `confirmer-${i}`,
    );
    queueConfirmerIds(confirmerIds);

    for (let i = 0; i < confirmerIds.length - 1; i++) {
      await confirmSpot("spot-1");
      const row = db.spots.find((r) => r.id === "spot-1");
      expect(row?.status).toBe("unconfirmed");
    }

    await confirmSpot("spot-1");
    const finalRow = db.spots.find((r) => r.id === "spot-1");
    expect(finalRow?.confirmations).toBeGreaterThanOrEqual(CONFIRMATION_THRESHOLD);
    expect(finalRow?.status).toBe("confirmed");
  });

  it("resolves to the updated spot reflecting the new confirmation count", async () => {
    const spotRow = makeSpotRow();
    const { client } = createFakeSupabase({ spots: [spotRow] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);
    queueConfirmerIds(["confirmer-a"]);

    const result = await confirmSpot("spot-1");

    expect(result.confirmations).toBe(1);
  });

  it("the confirmations insert payload is exactly { spot_id, confirmer_id } sourced from requireUserId()", async () => {
    const spotRow = makeSpotRow();
    const { client, calls } = createFakeSupabase({ spots: [spotRow] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);
    queueConfirmerIds(["confirmer-xyz"]);

    await confirmSpot("spot-1");

    const insertCall = calls.find((c) => c.table === "confirmations" && c.method === "insert");
    expect(insertCall?.args[0]).toEqual({ spot_id: "spot-1", confirmer_id: "confirmer-xyz" });
  });

  it("signed out: rejects before any query (requireUserId called first)", async () => {
    const authRequiredError = Object.assign(new Error("Sign in to continue."), {
      cause: { code: "auth_required" },
    });
    vi.mocked(requireUserId).mockRejectedValueOnce(authRequiredError);
    const spotRow = makeSpotRow();
    const { client, calls } = createFakeSupabase({ spots: [spotRow] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(confirmSpot("spot-1")).rejects.toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// reportSpot
// ---------------------------------------------------------------------------
describe("reportSpot", () => {
  it("rejects a reason not in REPORT_REASONS before making any network call", async () => {
    const fromMock = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    await expect(reportSpot("spot-1", "not_a_real_reason")).rejects.toBeTruthy();
    expect(fromMock).not.toHaveBeenCalled();
    expect(requireUserId).not.toHaveBeenCalled();
  });

  it("rejects a validly-named reason with the wrong casing before making any network call", async () => {
    const fromMock = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    await expect(reportSpot("spot-1", "Spam")).rejects.toBeTruthy();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("accepts a valid reason and reaches the network layer", async () => {
    const insertMock = vi.fn().mockReturnValue(Promise.resolve({ data: {}, error: null }));
    const fromMock = vi.fn(() => ({ insert: insertMock }));
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    await expect(reportSpot("spot-1", "spam")).resolves.not.toThrow();
    expect(fromMock).toHaveBeenCalled();
  });

  it("passes optional details through to the underlying call", async () => {
    const insertMock = vi.fn().mockReturnValue(Promise.resolve({ data: {}, error: null }));
    const fromMock = vi.fn(() => ({ insert: insertMock }));
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    await reportSpot("spot-1", "wrong_info", "The gate is closed on weekdays now.");

    const calledWith = insertMock.mock.calls[0]?.[0];
    expect(Object.values(calledWith ?? {})).toContain("The gate is closed on weekdays now.");
  });

  it("never sends reported_by -- the DB fills it from auth.uid()", async () => {
    const insertMock = vi.fn().mockReturnValue(Promise.resolve({ data: {}, error: null }));
    const fromMock = vi.fn(() => ({ insert: insertMock }));
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    await reportSpot("spot-1", "spam");

    expect(insertMock.mock.calls[0]?.[0]).not.toHaveProperty("reported_by");
  });

  it("resolves void on a 23505 duplicate (already reported this spot)", async () => {
    const insertMock = vi
      .fn()
      .mockReturnValue(Promise.resolve({ data: null, error: { code: "23505", message: "duplicate" } }));
    const fromMock = vi.fn(() => ({ insert: insertMock }));
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    await expect(reportSpot("spot-1", "spam")).resolves.toBeUndefined();
  });

  it("signed out: rejects before any query (validation still runs first)", async () => {
    const authRequiredError = Object.assign(new Error("Sign in to continue."), {
      cause: { code: "auth_required" },
    });
    vi.mocked(requireUserId).mockRejectedValueOnce(authRequiredError);
    const fromMock = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    await expect(reportSpot("spot-1", "spam")).rejects.toBeTruthy();
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fetchMyConfirmedSpotIds
// ---------------------------------------------------------------------------
describe("fetchMyConfirmedSpotIds", () => {
  it("resolves an empty set with no client call when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const fromMock = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    const result = await fetchMyConfirmedSpotIds();

    expect(result).toEqual(new Set());
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("resolves a set of spot_ids from select('spot_id') when signed in", async () => {
    const selectMock = vi
      .fn()
      .mockReturnValue(Promise.resolve({ data: [{ spot_id: "spot-1" }, { spot_id: "spot-2" }], error: null }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    const result = await fetchMyConfirmedSpotIds();

    expect(result).toEqual(new Set(["spot-1", "spot-2"]));
    expect(selectMock).toHaveBeenCalledWith("spot_id");
  });

  it("rejects when the client reports an error", async () => {
    const selectMock = vi
      .fn()
      .mockReturnValue(Promise.resolve({ data: null, error: { message: "network error" } }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    await expect(fetchMyConfirmedSpotIds()).rejects.toBeTruthy();
  });
});

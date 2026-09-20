import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/profiles";

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
import {
  getMyProfile,
  getProfileByHandle,
  updateHandle,
  uploadAvatar,
  follow,
  unfollow,
  isFollowing,
  isHandleAvailable,
  searchProfiles,
  profilesByIds,
} from "@/lib/profiles-repo";

function makeImageFile(name = "avatar.jpg", sizeBytes = 512): File {
  return new File([new Uint8Array(sizeBytes)], name, { type: "image/jpeg" });
}

const FIVE_MB = 5 * 1024 * 1024;

function profileRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user-1",
    handle: "kuya_ben",
    display_name: "Kuya Ben",
    avatar_url: null,
    needs_handle: false,
    follower_count: 3,
    following_count: 5,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUserId).mockResolvedValue("user-1");
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1", email: "a@b.com", nickname: "" });
});

// ---------------------------------------------------------------------------
// getMyProfile
// ---------------------------------------------------------------------------
describe("getMyProfile", () => {
  it("resolves null and never touches the client when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const fromMock = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    const result = await getMyProfile();

    expect(result).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("maps the profiles row (snake_case) into a camelCase Profile when signed in", async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: profileRow(), error: null });
    const eqMock = vi.fn(() => ({ single: singleMock }));
    const selectMock = vi.fn(() => ({ eq: eqMock }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    const result = await getMyProfile();

    expect(result).toMatchObject<Partial<Profile>>({
      id: "user-1",
      handle: "kuya_ben",
      displayName: "Kuya Ben",
      avatarUrl: null,
      needsHandle: false,
      followerCount: 3,
      followingCount: 5,
    });
  });
});

// ---------------------------------------------------------------------------
// getProfileByHandle
// ---------------------------------------------------------------------------
describe("getProfileByHandle", () => {
  it("is a public read -- never calls requireUserId", async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: profileRow(), error: null });
    const eqMock = vi.fn(() => ({ single: singleMock }));
    const selectMock = vi.fn(() => ({ eq: eqMock }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    await getProfileByHandle("kuya_ben");

    expect(requireUserId).not.toHaveBeenCalled();
  });

  it("resolves null (not a throw) when no profile matches the handle", async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } });
    const eqMock = vi.fn(() => ({ single: singleMock }));
    const selectMock = vi.fn(() => ({ eq: eqMock }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    await expect(getProfileByHandle("nobody")).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateHandle
// ---------------------------------------------------------------------------
describe("updateHandle", () => {
  it.each(["AB", "Has-Dash", "way-too-long-handle-name-here", "has space", ""])(
    "rejects an invalid handle (%s) before touching the client",
    async (badHandle) => {
      const fromMock = vi.fn();
      vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

      await expect(updateHandle(badHandle)).rejects.toBeTruthy();
      expect(fromMock).not.toHaveBeenCalled();
      expect(requireUserId).not.toHaveBeenCalled();
    },
  );

  it("accepts a valid lowercase handle and updates needs_handle to false", async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: profileRow({ handle: "new_handle" }), error: null });
    const selectMock = vi.fn(() => ({ single: singleMock }));
    const eqMock = vi.fn(() => ({ select: selectMock }));
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    const fromMock = vi.fn(() => ({ update: updateMock }));
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    await updateHandle("new_handle");

    const patch = updateMock.mock.calls[0][0];
    expect(patch).toMatchObject({ handle: "new_handle", needs_handle: false });
  });

  it("rejects with a 'taken' error on a unique-constraint violation (23505)", async () => {
    const singleMock = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });
    const selectMock = vi.fn(() => ({ single: singleMock }));
    const eqMock = vi.fn(() => ({ select: selectMock }));
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    const fromMock = vi.fn(() => ({ update: updateMock }));
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    await expect(updateHandle("taken_handle")).rejects.toThrow(/taken/i);
  });

  it("signed out: rejects before any query", async () => {
    const authRequiredError = Object.assign(new Error("Sign in to continue."), {
      cause: { code: "auth_required" },
    });
    vi.mocked(requireUserId).mockRejectedValueOnce(authRequiredError);
    const fromMock = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    await expect(updateHandle("valid_handle")).rejects.toBeTruthy();
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// isHandleAvailable
// ---------------------------------------------------------------------------
describe("isHandleAvailable", () => {
  it("returns false without calling the client for an invalid format", async () => {
    const rpcMock = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    const result = await isHandleAvailable("NOT VALID");

    expect(result).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("calls rpc('handle_available', { handle }) for a well-formed handle and returns its boolean", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: true, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    const result = await isHandleAvailable("kuya_ben");

    expect(result).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("handle_available", expect.objectContaining({ handle: "kuya_ben" }));
  });

  it("is callable while signed out (anon-callable rpc) -- never calls requireUserId", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: true, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

    await isHandleAvailable("kuya_ben");

    expect(requireUserId).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// uploadAvatar
// ---------------------------------------------------------------------------
describe("uploadAvatar", () => {
  it("signed out: rejects and never touches storage", async () => {
    const authRequiredError = Object.assign(new Error("Sign in to continue."), {
      cause: { code: "auth_required" },
    });
    vi.mocked(requireUserId).mockRejectedValueOnce(authRequiredError);
    const storageFromMock = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue({ storage: { from: storageFromMock } } as never);

    await expect(uploadAvatar(makeImageFile())).rejects.toBeTruthy();
    expect(storageFromMock).not.toHaveBeenCalled();
  });

  it("uploads under the signed-in user's own folder and returns the public URL", async () => {
    const uploadMock = vi.fn().mockResolvedValue({ data: { path: "user-1/abc.jpg" }, error: null });
    const getPublicUrlMock = vi
      .fn()
      .mockReturnValue({ data: { publicUrl: "https://cdn.example.com/avatars/user-1/abc.jpg" } });
    const storageFromMock = vi.fn(() => ({ upload: uploadMock, getPublicUrl: getPublicUrlMock }));
    vi.mocked(getSupabaseClient).mockReturnValue({ storage: { from: storageFromMock } } as never);

    const url = await uploadAvatar(makeImageFile());

    expect(storageFromMock).toHaveBeenCalledWith("avatars");
    const uploadedPath = uploadMock.mock.calls[0][0] as string;
    expect(uploadedPath.startsWith("user-1/")).toBe(true);
    expect(url).toBe("https://cdn.example.com/avatars/user-1/abc.jpg");
  });

  it("rejects an unsupported file type before calling storage", async () => {
    const storageFromMock = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue({ storage: { from: storageFromMock } } as never);

    const textFile = new File(["hi"], "notes.txt", { type: "text/plain" });
    await expect(uploadAvatar(textFile)).rejects.toBeTruthy();
    expect(storageFromMock).not.toHaveBeenCalled();
  });

  it("rejects a file at exactly the 5MB boundary with a '5MB' message, before calling storage", async () => {
    const storageFromMock = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue({ storage: { from: storageFromMock } } as never);

    const oversizedFile = makeImageFile("avatar.jpg", FIVE_MB);
    await expect(uploadAvatar(oversizedFile)).rejects.toThrow(/5MB/);
    expect(storageFromMock).not.toHaveBeenCalled();
  });

  it("accepts a file one byte under the 5MB boundary", async () => {
    const uploadMock = vi.fn().mockResolvedValue({ data: { path: "user-1/abc.jpg" }, error: null });
    const getPublicUrlMock = vi
      .fn()
      .mockReturnValue({ data: { publicUrl: "https://cdn.example.com/avatars/user-1/abc.jpg" } });
    const storageFromMock = vi.fn(() => ({ upload: uploadMock, getPublicUrl: getPublicUrlMock }));
    vi.mocked(getSupabaseClient).mockReturnValue({ storage: { from: storageFromMock } } as never);

    const url = await uploadAvatar(makeImageFile("avatar.jpg", FIVE_MB - 1));

    expect(storageFromMock).toHaveBeenCalledWith("avatars");
    expect(url).toBe("https://cdn.example.com/avatars/user-1/abc.jpg");
  });
});

// ---------------------------------------------------------------------------
// follow / unfollow / isFollowing -- stateful via the shared fake
// ---------------------------------------------------------------------------
describe("follow", () => {
  it("signed out: rejects before any insert", async () => {
    const authRequiredError = Object.assign(new Error("Sign in to continue."), {
      cause: { code: "auth_required" },
    });
    vi.mocked(requireUserId).mockRejectedValueOnce(authRequiredError);
    const { client, calls } = createFakeSupabase({ follows: [] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(follow("user-2")).rejects.toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it("rejects following yourself without ever inserting", async () => {
    const { client, calls } = createFakeSupabase({ follows: [] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(follow("user-1")).rejects.toBeTruthy();
    expect(calls.filter((c) => c.table === "follows" && c.method === "insert")).toHaveLength(0);
  });

  it("is idempotent -- following the same person twice does not throw and leaves one row", async () => {
    const { client, db } = createFakeSupabase({ follows: [] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await follow("user-2");
    await expect(follow("user-2")).resolves.not.toThrow();

    const rows = db.follows.filter((r) => r.follower_id === "user-1" && r.followee_id === "user-2");
    expect(rows).toHaveLength(1);
  });

  it("inserts exactly { follower_id, followee_id } from requireUserId() and the argument", async () => {
    const { client, calls } = createFakeSupabase({ follows: [] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await follow("user-2");

    const insertCall = calls.find((c) => c.table === "follows" && c.method === "insert");
    expect(insertCall?.args[0]).toEqual({ follower_id: "user-1", followee_id: "user-2" });
  });
});

describe("unfollow", () => {
  it("signed out: rejects before any delete", async () => {
    const authRequiredError = Object.assign(new Error("Sign in to continue."), {
      cause: { code: "auth_required" },
    });
    vi.mocked(requireUserId).mockRejectedValueOnce(authRequiredError);
    const { client, calls } = createFakeSupabase({ follows: [{ follower_id: "user-1", followee_id: "user-2" }] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(unfollow("user-2")).rejects.toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it("is idempotent -- unfollowing someone you don't follow does not throw", async () => {
    const { client } = createFakeSupabase({ follows: [] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(unfollow("user-2")).resolves.not.toThrow();
  });

  it("removes the row for the calling user only", async () => {
    const { client, db } = createFakeSupabase({
      follows: [
        { follower_id: "user-1", followee_id: "user-2" },
        { follower_id: "user-3", followee_id: "user-2" },
      ],
    });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await unfollow("user-2");

    expect(db.follows).toEqual([{ follower_id: "user-3", followee_id: "user-2" }]);
  });
});

describe("isFollowing", () => {
  it("resolves false without a client call when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const { client, calls } = createFakeSupabase({ follows: [] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    const result = await isFollowing("user-2");

    expect(result).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("resolves true when a follow row exists for this pair", async () => {
    const { client } = createFakeSupabase({ follows: [{ follower_id: "user-1", followee_id: "user-2" }] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(isFollowing("user-2")).resolves.toBe(true);
  });

  it("resolves false when no follow row exists for this pair", async () => {
    const { client } = createFakeSupabase({ follows: [{ follower_id: "user-1", followee_id: "user-9" }] });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await expect(isFollowing("user-2")).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// searchProfiles
// ---------------------------------------------------------------------------
describe("searchProfiles", () => {
  it("resolves an empty array without touching the client for a blank query", async () => {
    const fromMock = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    const result = await searchProfiles("   ");

    expect(result).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("maps matching profile rows for a non-blank query", async () => {
    const limitMock = vi.fn().mockResolvedValue({
      data: [profileRow({ id: "user-2", handle: "ben" }), profileRow({ id: "user-3", handle: "benny" })],
      error: null,
    });
    const orMock = vi.fn(() => ({ limit: limitMock }));
    const selectMock = vi.fn(() => ({ or: orMock }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    const result = await searchProfiles("ben");

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "user-2", handle: "ben" });
    expect(limitMock).toHaveBeenCalledWith(20);
  });
});

// ---------------------------------------------------------------------------
// profilesByIds -- fix round: gente-page's "Siguiendo" section needs to
// resolve full profiles for a set of ids (from followingIds()) instead of
// deriving them from feedNuevo's authors. Not implemented yet -- expected
// to fail red until profiles-repo.ts exports it.
// ---------------------------------------------------------------------------
describe("profilesByIds (fix round -- expected red)", () => {
  it("resolves an empty array without touching the client for an empty id list", async () => {
    const fromMock = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

    const result = await profilesByIds([]);

    expect(result).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns profiles for the given ids via an .in() query", async () => {
    const { client } = createFakeSupabaseForProfilesByIds([
      profileRow({ id: "user-2", handle: "ben" }),
      profileRow({ id: "user-3", handle: "cara" }),
    ]);
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    const result = await profilesByIds(["user-2", "user-3"]);

    expect(result.map((p: { id: string }) => p.id).sort()).toEqual(["user-2", "user-3"]);
  });
});

// Minimal local query-builder stand-in (mirrors the shape searchProfiles's
// own tests above build by hand) -- kept local to this describe block since
// it's the only place in this file that needs a plain `.select().in()` chain.
function createFakeSupabaseForProfilesByIds(rows: Record<string, unknown>[]) {
  const inMock = vi.fn().mockResolvedValue({ data: rows, error: null });
  const selectMock = vi.fn(() => ({ in: inMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  return { client: { from: fromMock } };
}

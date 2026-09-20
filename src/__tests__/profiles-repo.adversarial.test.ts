import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUserId: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import { getSupabaseClient } from "@/lib/supabase";
import { getCurrentUser, requireUserId } from "@/lib/auth";
import { updateHandle, isHandleAvailable } from "@/lib/profiles-repo";

function profileRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user-1",
    handle: "kuya_ben",
    display_name: "Kuya Ben",
    avatar_url: null,
    needs_handle: false,
    follower_count: 0,
    following_count: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUserId).mockResolvedValue("user-1");
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1", email: "a@b.com", nickname: "" });
});

/**
 * Adversarial pass on the handle validation contract: `^[a-z0-9_]{3,20}$`
 * mirrored client-side from 0004_social_spots.sql's `profiles_handle_format`
 * check.
 */
describe("adversarial: handle validation edge cases", () => {
  describe("updateHandle", () => {
    it("lowercases an uppercase-mixed handle before persisting it", async () => {
      const singleMock = vi
        .fn()
        .mockResolvedValue({ data: profileRow({ handle: "kuya_ben" }), error: null });
      const selectMock = vi.fn(() => ({ single: singleMock }));
      const eqMock = vi.fn(() => ({ select: selectMock }));
      const updateMock = vi.fn(() => ({ eq: eqMock }));
      const fromMock = vi.fn(() => ({ update: updateMock }));
      vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

      await updateHandle("KUYA_BEN");

      const patch = updateMock.mock.calls[0][0];
      expect(patch).toMatchObject({ handle: "kuya_ben" });
    });

    it("rejects a 21-character handle (one over the max) before touching the client", async () => {
      const fromMock = vi.fn();
      vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

      const twentyOneChars = "a".repeat(21);
      await expect(updateHandle(twentyOneChars)).rejects.toBeTruthy();
      expect(fromMock).not.toHaveBeenCalled();
    });

    it("accepts a 20-character handle (exactly at the max, boundary)", async () => {
      const twentyChars = "a".repeat(20);
      const singleMock = vi
        .fn()
        .mockResolvedValue({ data: profileRow({ handle: twentyChars }), error: null });
      const selectMock = vi.fn(() => ({ single: singleMock }));
      const eqMock = vi.fn(() => ({ select: selectMock }));
      const updateMock = vi.fn(() => ({ eq: eqMock }));
      const fromMock = vi.fn(() => ({ update: updateMock }));
      vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

      await expect(updateHandle(twentyChars)).resolves.toBeTruthy();
    });

    it("rejects a 2-character handle (one under the min) before touching the client", async () => {
      const fromMock = vi.fn();
      vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

      await expect(updateHandle("ab")).rejects.toBeTruthy();
      expect(fromMock).not.toHaveBeenCalled();
    });

    it.each(["kuyá_ben", "kuya_bén", "\u{1F600}kuyaben", "kuya–ben"])(
      "rejects a handle containing a non-ASCII/unicode character (%s) before touching the client",
      async (unicodeHandle) => {
        const fromMock = vi.fn();
        vi.mocked(getSupabaseClient).mockReturnValue({ from: fromMock } as never);

        await expect(updateHandle(unicodeHandle)).rejects.toBeTruthy();
        expect(fromMock).not.toHaveBeenCalled();
      },
    );
  });

  describe("isHandleAvailable", () => {
    it("lowercases before checking availability -- an uppercase query still reaches the rpc with the lowercased form", async () => {
      const rpcMock = vi.fn().mockResolvedValue({ data: true, error: null });
      vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

      await isHandleAvailable("KuYa_Ben");

      expect(rpcMock).toHaveBeenCalledWith("handle_available", expect.objectContaining({ handle: "kuya_ben" }));
    });

    it("rejects a 21-character handle without a client call", async () => {
      const rpcMock = vi.fn();
      vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

      const result = await isHandleAvailable("a".repeat(21));

      expect(result).toBe(false);
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it("rejects a handle containing an emoji without a client call", async () => {
      const rpcMock = vi.fn();
      vi.mocked(getSupabaseClient).mockReturnValue({ rpc: rpcMock } as never);

      const result = await isHandleAvailable("\u{1F600}kuyaben");

      expect(result).toBe(false);
      expect(rpcMock).not.toHaveBeenCalled();
    });
  });
});

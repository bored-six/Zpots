import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `useLocation()` (src/lib/use-location.ts): reads the browser's geolocation
 * once per session, falling back to Plaza Pershing when denied/unsupported
 * so Cerca never blocks (social-spots.md design decision "Geolocation").
 * Each test re-imports the module after vi.resetModules() so the "once per
 * session" memoization doesn't leak between tests (same pattern as
 * supabase.test.ts's singleton reset).
 */

const FALLBACK = { lat: 6.9106, lng: 122.0736 };

type Success = (pos: { coords: { latitude: number; longitude: number } }) => void;
type Failure = (err: { code: number; message: string }) => void;

function installGeolocation() {
  const getCurrentPosition = vi.fn();
  Object.defineProperty(globalThis.navigator, "geolocation", {
    value: { getCurrentPosition },
    configurable: true,
    writable: true,
  });
  return getCurrentPosition;
}

function removeGeolocation() {
  Object.defineProperty(globalThis.navigator, "geolocation", {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useLocation", () => {
  it("starts in a loading state with the fallback coordinates already available (never blocks first render)", async () => {
    const getCurrentPosition = installGeolocation();
    getCurrentPosition.mockImplementation(() => {
      // Never resolves during this test -- simulates a slow prompt.
    });

    const { useLocation } = await import("@/lib/use-location");
    const { result } = renderHook(() => useLocation());

    expect(result.current.status).toBe("loading");
    expect(result.current.coords).toEqual(FALLBACK);
  });

  it("resolves to 'granted' with the real coordinates on success", async () => {
    const getCurrentPosition = installGeolocation();
    getCurrentPosition.mockImplementation((success: Success) => {
      success({ coords: { latitude: 6.95, longitude: 122.05 } });
    });

    const { useLocation } = await import("@/lib/use-location");
    const { result } = renderHook(() => useLocation());

    await waitFor(() => expect(result.current.status).toBe("granted"));
    expect(result.current.coords).toEqual({ lat: 6.95, lng: 122.05 });
    expect(result.current.isFallback).toBe(false);
  });

  it("resolves to 'denied' with the fallback coordinates when permission is refused", async () => {
    const getCurrentPosition = installGeolocation();
    getCurrentPosition.mockImplementation((_success: Success, failure: Failure) => {
      failure({ code: 1, message: "User denied Geolocation" });
    });

    const { useLocation } = await import("@/lib/use-location");
    const { result } = renderHook(() => useLocation());

    await waitFor(() => expect(result.current.status).toBe("denied"));
    expect(result.current.coords).toEqual(FALLBACK);
    expect(result.current.isFallback).toBe(true);
  });

  it("falls back to 'denied' with fallback coordinates when the browser has no geolocation API at all", async () => {
    removeGeolocation();

    const { useLocation } = await import("@/lib/use-location");
    const { result } = renderHook(() => useLocation());

    await waitFor(() => expect(result.current.status).toBe("denied"));
    expect(result.current.coords).toEqual(FALLBACK);
  });

  it("calls getCurrentPosition only once even when the hook is used from two places at once (once per session)", async () => {
    const getCurrentPosition = installGeolocation();
    getCurrentPosition.mockImplementation((success: Success) => {
      success({ coords: { latitude: 6.95, longitude: 122.05 } });
    });

    const { useLocation } = await import("@/lib/use-location");
    const first = renderHook(() => useLocation());
    const second = renderHook(() => useLocation());

    await waitFor(() => expect(first.result.current.status).toBe("granted"));
    await waitFor(() => expect(second.result.current.status).toBe("granted"));

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("a remount after the first resolution reuses the cached result instead of re-prompting", async () => {
    const getCurrentPosition = installGeolocation();
    getCurrentPosition.mockImplementation((success: Success) => {
      success({ coords: { latitude: 6.95, longitude: 122.05 } });
    });

    const { useLocation } = await import("@/lib/use-location");
    const first = renderHook(() => useLocation());
    await waitFor(() => expect(first.result.current.status).toBe("granted"));
    first.unmount();

    const second = renderHook(() => useLocation());
    await waitFor(() => expect(second.result.current.status).toBe("granted"));

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(second.result.current.coords).toEqual({ lat: 6.95, lng: 122.05 });
  });

  it("does not throw or update state after unmount (no act() warning from a late callback)", async () => {
    let capturedSuccess: Success = () => {};
    const getCurrentPosition = installGeolocation();
    getCurrentPosition.mockImplementation((success: Success) => {
      capturedSuccess = success;
    });

    const { useLocation } = await import("@/lib/use-location");
    const { unmount } = renderHook(() => useLocation());
    unmount();

    expect(() => {
      act(() => {
        capturedSuccess({ coords: { latitude: 1, longitude: 2 } });
      });
    }).not.toThrow();
  });
});

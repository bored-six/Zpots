import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Task A (`.claude/handoff/spec.md`, "TASK A -- Geolocation options +
 * watchdog"): `startLocating()` in `src/lib/use-location.ts` gains a
 * `PositionOptions` third argument (`GEOLOCATION_OPTIONS`) AND a 12s
 * wall-clock watchdog with a settle-once guard, because
 * `PositionOptions.timeout` only starts counting once the browser
 * permission prompt is answered -- an unanswered prompt does not trip it.
 *
 * THIS FILE IS EXPECTED TO FAIL RED: `GEOLOCATION_OPTIONS`,
 * `LOCATION_WATCHDOG_MS`, and the watchdog behaviour they describe do not
 * exist yet in `src/lib/use-location.ts`. Do not "fix" this file to make
 * it pass -- implement the module instead.
 *
 * Same singleton-reset harness as `use-location.test.ts`: the hook holds
 * module-level state guarded by a `started` flag, so every test does
 * `vi.resetModules()` in `beforeEach` and a fresh dynamic
 * `await import("@/lib/use-location")`, exactly as that file's own
 * top-of-file comment documents. Do not add a second test to the same
 * dynamically-imported module instance -- the `started` guard means only
 * the first `startLocating()` call per module instance does anything.
 *
 * Per spec A.5 #12, some assertions here intentionally spy on
 * `console.error` to prove a late/unmounted callback logs no React
 * `act(...)` warning -- restored via `vi.restoreAllMocks()` in `afterEach`.
 */

const FALLBACK = { lat: 6.9106, lng: 122.0736 };
/** Inside `ZAMBOANGA_CITY_BOUNDS` -- same in-city fixture use-location.test.ts uses. */
const IN_CITY = { lat: 6.95, lng: 122.05 };

type Success = (pos: { coords: { latitude: number; longitude: number } }) => void;
type Failure = (err: { code: number; message: string }) => void;
type GetCurrentPosition = (success: Success, failure: Failure, options?: PositionOptions) => void;

function installGeolocation() {
  const getCurrentPosition = vi.fn<GetCurrentPosition>();
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useLocation -- GEOLOCATION_OPTIONS + watchdog (spec A.5)", () => {
  it("A.5.1 -- calls getCurrentPosition with exactly three arguments", async () => {
    const getCurrentPosition = installGeolocation();
    getCurrentPosition.mockImplementation((success) => {
      success({ coords: { latitude: IN_CITY.lat, longitude: IN_CITY.lng } });
    });

    const { useLocation } = await import("@/lib/use-location");
    const { result } = renderHook(() => useLocation());
    await waitFor(() => expect(result.current.status).toBe("granted"));

    expect(getCurrentPosition.mock.calls[0]).toHaveLength(3);
  });

  it("A.5.2 -- the third argument is the exported GEOLOCATION_OPTIONS object, same reference", async () => {
    const getCurrentPosition = installGeolocation();
    getCurrentPosition.mockImplementation((success) => {
      success({ coords: { latitude: IN_CITY.lat, longitude: IN_CITY.lng } });
    });

    const { useLocation, GEOLOCATION_OPTIONS } = await import("@/lib/use-location");
    const { result } = renderHook(() => useLocation());
    await waitFor(() => expect(result.current.status).toBe("granted"));

    expect(getCurrentPosition.mock.calls[0][2]).toBe(GEOLOCATION_OPTIONS);
  });

  it("A.5.3 -- GEOLOCATION_OPTIONS deep-equals the exact spec values", async () => {
    const { GEOLOCATION_OPTIONS } = await import("@/lib/use-location");

    expect(GEOLOCATION_OPTIONS).toEqual({
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 300_000,
    });
  });

  it("A.5.4 -- enableHighAccuracy is strictly false, not merely falsy/absent", async () => {
    const { GEOLOCATION_OPTIONS } = await import("@/lib/use-location");

    expect(Object.hasOwn(GEOLOCATION_OPTIONS, "enableHighAccuracy")).toBe(true);
    expect(GEOLOCATION_OPTIONS.enableHighAccuracy).toBe(false);
  });

  it("A.5.5 -- LOCATION_WATCHDOG_MS is strictly greater than GEOLOCATION_OPTIONS.timeout", async () => {
    const { GEOLOCATION_OPTIONS, LOCATION_WATCHDOG_MS } = await import("@/lib/use-location");

    expect(LOCATION_WATCHDOG_MS).toBeGreaterThan(GEOLOCATION_OPTIONS.timeout as number);
  });

  it("A.5.6 -- a TIMEOUT error (code 3) from the browser's own timeout routes to denied+fallback", async () => {
    const getCurrentPosition = installGeolocation();
    getCurrentPosition.mockImplementation((_success, failure) => {
      failure({ code: 3, message: "Timeout expired" });
    });

    const { useLocation } = await import("@/lib/use-location");
    const { result } = renderHook(() => useLocation());

    await waitFor(() => expect(result.current.status).toBe("denied"));
    expect(result.current.coords).toEqual(FALLBACK);
    expect(result.current.isFallback).toBe(true);
  });

  it("A.5.7 -- the watchdog fires after LOCATION_WATCHDOG_MS when the prompt is never answered", async () => {
    vi.useFakeTimers();
    const getCurrentPosition = installGeolocation();
    getCurrentPosition.mockImplementation(() => {
      // Never calls back -- simulates an unanswered permission prompt.
    });

    const { useLocation, LOCATION_WATCHDOG_MS } = await import("@/lib/use-location");
    const { result } = renderHook(() => useLocation());

    expect(result.current.status).toBe("loading");

    act(() => {
      vi.advanceTimersByTime(LOCATION_WATCHDOG_MS);
    });

    expect(result.current.status).toBe("denied");
    expect(result.current.coords).toEqual(FALLBACK);
    expect(result.current.isFallback).toBe(true);
  });

  it("A.5.8 -- NEGATIVE: the watchdog does not clobber a success that already landed", async () => {
    vi.useFakeTimers();
    const getCurrentPosition = installGeolocation();
    getCurrentPosition.mockImplementation((success) => {
      success({ coords: { latitude: IN_CITY.lat, longitude: IN_CITY.lng } });
    });

    const { useLocation, LOCATION_WATCHDOG_MS } = await import("@/lib/use-location");
    const { result } = renderHook(() => useLocation());

    expect(result.current.status).toBe("granted");
    expect(result.current.coords).toEqual(IN_CITY);

    act(() => {
      vi.advanceTimersByTime(LOCATION_WATCHDOG_MS);
    });

    expect(result.current.status).toBe("granted");
    expect(result.current.coords).toEqual(IN_CITY);
    expect(result.current.isFallback).toBe(false);
  });

  it("A.5.9 -- NEGATIVE (settle-once): a late success after the watchdog already fired does not upgrade state", async () => {
    vi.useFakeTimers();
    let capturedSuccess: Success = () => {};
    const getCurrentPosition = installGeolocation();
    getCurrentPosition.mockImplementation((success) => {
      capturedSuccess = success;
    });

    const { useLocation, LOCATION_WATCHDOG_MS } = await import("@/lib/use-location");
    const { result } = renderHook(() => useLocation());

    act(() => {
      vi.advanceTimersByTime(LOCATION_WATCHDOG_MS);
    });
    expect(result.current.status).toBe("denied");

    act(() => {
      capturedSuccess({ coords: { latitude: IN_CITY.lat, longitude: IN_CITY.lng } });
    });

    expect(result.current.status).toBe("denied");
    expect(result.current.coords).toEqual(FALLBACK);
    expect(result.current.isFallback).toBe(true);
  });

  it("A.5.10 -- NEGATIVE: the no-API branch settles immediately and schedules no timer at all", async () => {
    vi.useFakeTimers();
    removeGeolocation();

    const { useLocation } = await import("@/lib/use-location");
    const { result } = renderHook(() => useLocation());

    expect(result.current.status).toBe("denied");
    expect(result.current.coords).toEqual(FALLBACK);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("A.5.11 -- NEGATIVE: no crash when navigator itself is undefined", async () => {
    vi.stubGlobal("navigator", undefined);

    const { useLocation } = await import("@/lib/use-location");

    expect(() => renderHook(() => useLocation())).not.toThrow();
  });

  it("A.5.12 -- NEGATIVE: a late watchdog firing after unmount throws nothing and logs no act() warning", async () => {
    vi.useFakeTimers();
    const getCurrentPosition = installGeolocation();
    getCurrentPosition.mockImplementation(() => {
      // Never calls back -- the watchdog is the only thing that will fire.
    });

    const { useLocation, LOCATION_WATCHDOG_MS } = await import("@/lib/use-location");
    const { unmount } = renderHook(() => useLocation());
    unmount();

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(LOCATION_WATCHDOG_MS);
      });
    }).not.toThrow();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("A.5.13 -- the watchdog timer is cleared on success (no lingering timer)", async () => {
    vi.useFakeTimers();
    const getCurrentPosition = installGeolocation();
    getCurrentPosition.mockImplementation((success) => {
      success({ coords: { latitude: IN_CITY.lat, longitude: IN_CITY.lng } });
    });

    const { useLocation } = await import("@/lib/use-location");
    renderHook(() => useLocation());

    expect(vi.getTimerCount()).toBe(0);
  });
});

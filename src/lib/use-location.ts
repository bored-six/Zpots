"use client";

import { useEffect, useReducer, useRef } from "react";

import { isWithinZamboangaCity } from "@/lib/city-bounds";
import type { LatLng } from "@/lib/geo";

/**
 * `useLocation()` (social-spots.md, "Geolocation" design decision): reads
 * `navigator.geolocation` once per browser session and falls back to
 * Plaza Pershing on denial, an unavailable API, or a fix outside city
 * bounds, so the Cerca lane never blocks on a permission prompt.
 *
 * The lookup itself is module-level singleton state (not `useState`) so
 * every hook instance across the app shares one in-flight request and one
 * resolved result -- `getCurrentPosition` triggers exactly one browser
 * permission prompt per session, no matter how many components call this
 * hook or how many times a given component remounts.
 */

export type LocationStatus = "loading" | "granted" | "denied";

export interface LocationResult {
  status: LocationStatus;
  coords: LatLng;
  isFallback: boolean;
}

/** Plaza Pershing, Zamboanga City -- the fallback point when a real fix isn't available. */
export const FALLBACK_COORDS: LatLng = { lat: 6.9106, lng: 122.0736 };

/**
 * `PositionOptions` for `getCurrentPosition()` (spec `ubicacion` A.3). This is a
 * walking-scale city app: a coarse, cheap fix is plenty, so high accuracy is off,
 * a 10s browser-side timeout stops a stalled acquisition, and a 5 minute cached
 * fix is accepted since the hook fetches once per session and never refreshes.
 */
export const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 300_000,
};

/**
 * Wall-clock watchdog (spec `ubicacion` A.2): `PositionOptions.timeout` only
 * starts counting once the browser's permission prompt is answered, so it does
 * not cover an unanswered prompt. This watchdog does. Deliberately longer than
 * `GEOLOCATION_OPTIONS.timeout` so the browser's own timeout gets a chance to
 * fire first through the normal error callback.
 */
export const LOCATION_WATCHDOG_MS = 12_000;

let state: LocationResult = { status: "loading", coords: FALLBACK_COORDS, isFallback: true };
let started = false;
const listeners = new Set<() => void>();

function setState(next: LocationResult): void {
  state = next;
  for (const listener of listeners) listener();
}

function startLocating(): void {
  if (started) return;
  started = true;

  const geolocation = typeof navigator !== "undefined" ? navigator.geolocation : undefined;
  if (!geolocation) {
    setState({ status: "denied", coords: FALLBACK_COORDS, isFallback: true });
    return;
  }

  let settled = false;

  const watchdog = setTimeout(() => {
    if (settled) return;
    settled = true;
    setState({ status: "denied", coords: FALLBACK_COORDS, isFallback: true });
  }, LOCATION_WATCHDOG_MS);

  geolocation.getCurrentPosition(
    (position) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      const coords: LatLng = { lat: position.coords.latitude, lng: position.coords.longitude };
      if (isWithinZamboangaCity(coords.lat, coords.lng)) {
        setState({ status: "granted", coords, isFallback: false });
      } else {
        setState({ status: "denied", coords: FALLBACK_COORDS, isFallback: true });
      }
    },
    () => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      setState({ status: "denied", coords: FALLBACK_COORDS, isFallback: true });
    },
    GEOLOCATION_OPTIONS,
  );
}

export function useLocation(): LocationResult {
  const [, forceRender] = useReducer((count: number) => count + 1, 0);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    const listener = () => {
      if (mountedRef.current) forceRender();
    };
    listeners.add(listener);
    startLocating();

    return () => {
      mountedRef.current = false;
      listeners.delete(listener);
    };
  }, []);

  return state;
}

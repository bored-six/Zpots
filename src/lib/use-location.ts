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

  geolocation.getCurrentPosition(
    (position) => {
      const coords: LatLng = { lat: position.coords.latitude, lng: position.coords.longitude };
      if (isWithinZamboangaCity(coords.lat, coords.lng)) {
        setState({ status: "granted", coords, isFallback: false });
      } else {
        setState({ status: "denied", coords: FALLBACK_COORDS, isFallback: true });
      }
    },
    () => {
      setState({ status: "denied", coords: FALLBACK_COORDS, isFallback: true });
    },
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

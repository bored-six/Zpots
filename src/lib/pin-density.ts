/**
 * Density-responsive pin sizing (pin-revamp-spec.md section 5). Pure: no
 * Leaflet, no DOM, no React. `SpotMap` calls `computePinTiers` on `zoomend`
 * and on render, never on `move`/`moveend` -- pixel distance between two
 * spots is invariant under pan.
 */

export const PIN_TIER_SIZES = [44, 32, 22, 16, 10] as const;
export type PinTier = 0 | 1 | 2 | 3 | 4;
export const PHOTO_CEILING_TIER: PinTier = 0;
export const PLAIN_CEILING_TIER: PinTier = 1;
export const PHOTO_LAST_TIER: PinTier = 1; // tiers > 1 drop the photo
export const GLYPH_LAST_TIER: PinTier = 2; // tiers > 2 drop the glyph (closed rose)
export const PUNTO_TIER: PinTier = 4;
export const DENSITY_SEARCH_PX = 44; // = PIN_TIER_SIZES[0]

export interface DensityPoint {
  key: string;
  lat: number;
  lng: number;
  wantsPhoto: boolean;
}

const TILE_SIZE = 256;
const MAX_LATITUDE = 85.0511287798;

/**
 * Web-Mercator pixel coordinates at `zoom`, 256-px tiles: identical to
 * Leaflet's `L.CRS.EPSG3857` `project` + `scale`. Latitude is clamped to
 * ±85.0511287798 so the projection never returns NaN/Infinity at the poles.
 */
export function projectPx(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const clampedLat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
  const scale = TILE_SIZE * 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const phi = (clampedLat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * scale;
  return { x, y };
}

/**
 * Nearest-neighbour distance per key, exact within `searchPx`; Infinity when
 * nothing is within it. Grid-bucketed with cell = searchPx, so any point
 * within `searchPx` of another is guaranteed to fall inside its 3x3 cell
 * neighbourhood -- points two or more cells apart are always >= searchPx
 * apart. O(n).
 */
export function nearestNeighbourPx(
  points: readonly { key: string; x: number; y: number }[],
  searchPx: number,
): Map<string, number> {
  const result = new Map<string, number>();
  if (points.length === 0) return result;

  const cellKey = (cx: number, cy: number) => `${cx}:${cy}`;
  const grid = new Map<string, { key: string; x: number; y: number }[]>();

  for (const point of points) {
    const cx = Math.floor(point.x / searchPx);
    const cy = Math.floor(point.y / searchPx);
    const k = cellKey(cx, cy);
    const bucket = grid.get(k);
    if (bucket) {
      bucket.push(point);
    } else {
      grid.set(k, [point]);
    }
  }

  for (const point of points) {
    const cx = Math.floor(point.x / searchPx);
    const cy = Math.floor(point.y / searchPx);
    let best = Infinity;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(cellKey(cx + dx, cy + dy));
        if (!bucket) continue;
        for (const other of bucket) {
          if (other === point) continue;
          const d = Math.hypot(other.x - point.x, other.y - point.y);
          if (d < best) best = d;
        }
      }
    }

    result.set(point.key, best <= searchPx ? best : Infinity);
  }

  return result;
}

/** Largest tier ≤ ceiling whose size ≤ d; PUNTO_TIER if none. d = Infinity → ceiling. */
export function tierForDistance(nearestPx: number, ceiling: PinTier): PinTier {
  for (let tier = ceiling; tier <= PUNTO_TIER; tier++) {
    if (PIN_TIER_SIZES[tier] <= nearestPx) {
      return tier as PinTier;
    }
  }
  return PUNTO_TIER;
}

/** Composes the three. Points with non-finite lat/lng get no entry and never throw. */
export function computePinTiers(points: readonly DensityPoint[], zoom: number): Map<string, PinTier> {
  const validPoints = points.filter(
    (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
  );

  const projected = validPoints.map((point) => {
    const { x, y } = projectPx(point.lat, point.lng, zoom);
    return { key: point.key, x, y };
  });

  const nearest = nearestNeighbourPx(projected, DENSITY_SEARCH_PX);

  const tiers = new Map<string, PinTier>();
  for (const point of validPoints) {
    const ceiling = point.wantsPhoto ? PHOTO_CEILING_TIER : PLAIN_CEILING_TIER;
    const distance = nearest.get(point.key) ?? Infinity;
    tiers.set(point.key, tierForDistance(distance, ceiling));
  }

  return tiers;
}

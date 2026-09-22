// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  computePinTiers,
  DENSITY_SEARCH_PX,
  nearestNeighbourPx,
  PIN_TIER_SIZES,
  PUNTO_TIER,
  projectPx,
  tierForDistance,
  type DensityPoint,
} from "@/lib/pin-density";

/**
 * grabado-pins spec (.claude/handoff/pin-revamp-spec.md), section 10.1,
 * revised by section 14.10 for revision 2 (no photo on any pin; four-tier
 * ladder [32, 22, 16, 10]).
 *
 * THIS FILE IS EXPECTED TO FAIL RED against the revision-1 implementation:
 * `PIN_TIER_SIZES` still has five rungs, `tierForDistance` still takes a
 * `ceiling` argument, and `DensityPoint` still has `wantsPhoto`.
 */

describe("projectPx", () => {
  it("projects (0,0) at zoom 0 onto the single tile's center", () => {
    expect(projectPx(0, 0, 0)).toEqual({ x: 128, y: 128 });
  });

  it("matches the spec's worked value for the Zamboanga center at z14", () => {
    const { x, y } = projectPx(6.9214, 122.079, 14);
    expect(x).toBeCloseTo(3519475.439, 2);
    expect(y).toBeCloseTo(2016314.997, 2);
  });

  it("clamps latitude at the pole so the projection never returns NaN or Infinity", () => {
    const { x, y } = projectPx(90, 0, 1);
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);
  });
});

describe("nearestNeighbourPx", () => {
  it("two points 20px apart see each other, symmetrically, as their nearest neighbour", () => {
    const points = [
      { key: "a", x: 0, y: 0 },
      { key: "b", x: 20, y: 0 },
    ];
    const result = nearestNeighbourPx(points, 44);
    expect(result.get("a")).toBeCloseTo(20);
    expect(result.get("b")).toBeCloseTo(20);
  });

  it("a third point 100px away with searchPx 44 gets Infinity, not the 100px distance", () => {
    const points = [
      { key: "a", x: 0, y: 0 },
      { key: "b", x: 20, y: 0 },
      { key: "c", x: 100, y: 0 },
    ];
    const result = nearestNeighbourPx(points, 44);
    expect(result.get("c")).toBe(Infinity);
  });

  it("an empty array returns an empty Map", () => {
    const result = nearestNeighbourPx([], 44);
    expect(result.size).toBe(0);
  });

  it("a lone point gets Infinity", () => {
    const result = nearestNeighbourPx([{ key: "a", x: 0, y: 0 }], 44);
    expect(result.get("a")).toBe(Infinity);
  });

  it("matches brute-force nearest-neighbour distance for 300 seeded pseudo-random points", () => {
    // Small seeded PRNG (mulberry32) so the fixture is reproducible without
    // pulling in a dependency.
    function mulberry32(seed: number) {
      let state = seed;
      return function next() {
        state |= 0;
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const rand = mulberry32(42);
    const points = Array.from({ length: 300 }, (_, i) => ({
      key: `p${i}`,
      x: rand() * 400,
      y: rand() * 400,
    }));
    const searchPx = 44;

    const result = nearestNeighbourPx(points, searchPx);

    for (const point of points) {
      let best = Infinity;
      for (const other of points) {
        if (other.key === point.key) continue;
        const d = Math.hypot(other.x - point.x, other.y - point.y);
        if (d < best) best = d;
      }
      const expected = best <= searchPx ? best : Infinity;
      const actual = result.get(point.key);
      if (expected === Infinity) {
        expect(actual).toBe(Infinity);
      } else {
        expect(actual).toBeCloseTo(expected, 6);
      }
    }
  });
});

describe("tierForDistance", () => {
  it.each([
    [Infinity, 0],
    [32, 0],
    [31.9, 1],
    [22, 1],
    [21.9, 2],
    [16, 2],
    [15.9, 3],
    [0, 3],
  ] as const)("tierForDistance(%p) -> %p", (distance, expected) => {
    expect(tierForDistance(distance)).toBe(expected);
  });
});

describe("computePinTiers", () => {
  // Fixtures A/B/C from spec section 5.3.
  const A: DensityPoint = { key: "spot:a", lat: 6.9214, lng: 122.079 };
  const B: DensityPoint = { key: "spot:b", lat: 6.9231, lng: 122.079 };
  const C: DensityPoint = { key: "spot:c", lat: 6.9214, lng: 122.0805 };

  it("z14: A and B (189m apart, ~19.95px) both settle on tier 2 (16px)", () => {
    const tiers = computePinTiers([A, B], 14);
    expect(tiers.get(A.key)).toBe(2);
    expect(tiers.get(B.key)).toBe(2);
  });

  it("z16: A and B are far enough apart to ride to the ceiling (tier 0, 32px)", () => {
    const tiers = computePinTiers([A, B], 16);
    expect(tiers.get(A.key)).toBe(0);
    expect(tiers.get(B.key)).toBe(0);
  });

  it("z12: A and B (now ~5px apart) both fall to the punto tier", () => {
    const tiers = computePinTiers([A, B], 12);
    expect(tiers.get(A.key)).toBe(PUNTO_TIER);
    expect(tiers.get(B.key)).toBe(PUNTO_TIER);
  });

  it("a point with a non-finite lat gets no entry, does not throw, and leaves the others unaffected", () => {
    const bad: DensityPoint = { key: "spot:bad", lat: NaN, lng: 122.079 };
    expect(() => computePinTiers([A, bad, B, C], 14)).not.toThrow();

    const tiers = computePinTiers([A, bad, B, C], 14);
    expect(tiers.has("spot:bad")).toBe(false);
    expect(tiers.get(A.key)).toBe(2);
    expect(tiers.get(B.key)).toBe(2);
  });

  it("is deterministic: two calls with the same input produce an equal map", () => {
    const points = [A, B, C];
    const first = computePinTiers(points, 14);
    const second = computePinTiers(points, 14);
    expect(Array.from(first.entries())).toEqual(Array.from(second.entries()));
  });
});

describe("PIN_TIER_SIZES", () => {
  it("is strictly descending, its first entry is DENSITY_SEARCH_PX, and it has exactly four rungs", () => {
    for (let i = 1; i < PIN_TIER_SIZES.length; i++) {
      expect(PIN_TIER_SIZES[i]).toBeLessThan(PIN_TIER_SIZES[i - 1]);
    }
    expect(PIN_TIER_SIZES[0]).toBe(DENSITY_SEARCH_PX);
    expect(PIN_TIER_SIZES).toHaveLength(4);
    expect(PIN_TIER_SIZES[PUNTO_TIER]).toBe(10);
  });
});

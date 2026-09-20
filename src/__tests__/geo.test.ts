import { describe, expect, it } from "vitest";
import { haversineMeters, formatDistance } from "@/lib/geo";

/**
 * Pure math module (spec: social-spots.md, src/lib/geo.ts). No PostGIS --
 * the SQL functions (feed_cerca) use the same haversine formula server-side,
 * so the "known pairs" here double as the contract both sides must agree on.
 * Mean Earth radius (~6371 km) is the expected constant; the tolerance below
 * is wide enough to tolerate a reasonable choice of radius constant (mean vs
 * equatorial) but tight enough to catch a wrong formula, wrong units
 * (km vs m), or a degrees/radians mixup.
 */
describe("haversineMeters", () => {
  it("is zero for identical points", () => {
    const p = { lat: 6.9106, lng: 122.0736 };
    expect(haversineMeters(p, p)).toBe(0);
  });

  it("is symmetric: distance(a, b) === distance(b, a)", () => {
    const a = { lat: 6.9106, lng: 122.0736 };
    const b = { lat: 6.9098, lng: 122.079 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });

  it("one degree of latitude (pure north-south) is close to 111.19 km", () => {
    const a = { lat: 6.0, lng: 122.0 };
    const b = { lat: 7.0, lng: 122.0 };
    const meters = haversineMeters(a, b);
    expect(meters).toBeGreaterThan(110500);
    expect(meters).toBeLessThan(111900);
  });

  it("half the latitude delta is roughly half the distance (near-linearity over a short span)", () => {
    const a = { lat: 6.0, lng: 122.0 };
    const full = haversineMeters(a, { lat: 7.0, lng: 122.0 });
    const half = haversineMeters(a, { lat: 6.5, lng: 122.0 });
    expect(half).toBeGreaterThan(full * 0.45);
    expect(half).toBeLessThan(full * 0.55);
  });

  it("never returns a negative number", () => {
    const a = { lat: 6.9106, lng: 122.0736 };
    const b = { lat: 6.5, lng: 121.8 };
    expect(haversineMeters(a, b)).toBeGreaterThanOrEqual(0);
  });

  it("handles antipodal-ish large distances without NaN/Infinity", () => {
    const a = { lat: 6.9106, lng: 122.0736 };
    const b = { lat: -6.9106, lng: -57.9264 }; // roughly antipodal
    const meters = haversineMeters(a, b);
    expect(Number.isFinite(meters)).toBe(true);
    expect(meters).toBeGreaterThan(19_000_000); // > half Earth's circumference-ish
  });
});

describe("formatDistance", () => {
  it("renders sub-kilometer distances in meters, rounded", () => {
    expect(formatDistance(650)).toMatch(/^650\s*m$/i);
  });

  it("renders zero as 0 m, not blank or NaN", () => {
    expect(formatDistance(0)).toMatch(/^0\s*m$/i);
  });

  it("renders kilometer-plus distances in km with one decimal", () => {
    expect(formatDistance(2340)).toMatch(/^2\.3\s*km$/i);
  });

  it("rounds meters to the nearest whole number (no decimals under 1km)", () => {
    expect(formatDistance(199.6)).toMatch(/^200\s*m$/i);
  });

  it("never contains a negative sign for a valid non-negative input", () => {
    expect(formatDistance(50)).not.toMatch(/-/);
  });
});

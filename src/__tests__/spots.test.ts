import { describe, expect, it } from "vitest";
import { SEED_SPOTS, isConfirmed, type Spot } from "@/lib/spots";

// Rough bounding box for Zamboanga City
const LAT_MIN = 6.8;
const LAT_MAX = 7.1;
const LNG_MIN = 121.9;
const LNG_MAX = 122.2;

describe("SEED_SPOTS", () => {
  it("has exactly one entry for this milestone", () => {
    expect(SEED_SPOTS).toHaveLength(1);
  });

  it("has coordinates inside the Zamboanga City bounding box", () => {
    for (const spot of SEED_SPOTS) {
      expect(spot.lat).toBeGreaterThanOrEqual(LAT_MIN);
      expect(spot.lat).toBeLessThanOrEqual(LAT_MAX);
      expect(spot.lng).toBeGreaterThanOrEqual(LNG_MIN);
      expect(spot.lng).toBeLessThanOrEqual(LNG_MAX);
    }
  });

  it("has a createdAt that parses as a valid ISO 8601 date", () => {
    for (const spot of SEED_SPOTS) {
      expect(typeof spot.createdAt).toBe("string");
      const parsed = new Date(spot.createdAt);
      expect(Number.isNaN(parsed.getTime())).toBe(false);
    }
  });

  it("has unique ids across all seed spots", () => {
    const ids = SEED_SPOTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has non-empty id, name, and note strings", () => {
    for (const spot of SEED_SPOTS) {
      expect(spot.id.trim().length).toBeGreaterThan(0);
      expect(spot.name.trim().length).toBeGreaterThan(0);
      expect(spot.note.trim().length).toBeGreaterThan(0);
    }
  });

  it("has a status field consistent with its confirmations count", () => {
    for (const spot of SEED_SPOTS) {
      if (spot.confirmations >= 2) {
        expect(spot.status).toBe("confirmed");
      } else {
        expect(spot.status).toBe("unconfirmed");
      }
      // and isConfirmed() must agree with the stored status
      expect(isConfirmed(spot)).toBe(spot.status === "confirmed");
    }
  });

  it("has a non-negative integer confirmations count", () => {
    for (const spot of SEED_SPOTS) {
      expect(Number.isInteger(spot.confirmations)).toBe(true);
      expect(spot.confirmations).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("isConfirmed", () => {
  const makeSpot = (confirmations: number): Spot => ({
    id: "test-spot",
    name: "Test Spot",
    note: "A place for testing.",
    lat: 6.9214,
    lng: 122.079,
    status: confirmations >= 2 ? "confirmed" : "unconfirmed",
    confirmations,
    createdAt: new Date().toISOString(),
  });

  it("returns false for 0 confirmations", () => {
    expect(isConfirmed(makeSpot(0))).toBe(false);
  });

  it("returns false for 1 confirmation", () => {
    expect(isConfirmed(makeSpot(1))).toBe(false);
  });

  it("returns true for exactly 2 confirmations (the boundary)", () => {
    expect(isConfirmed(makeSpot(2))).toBe(true);
  });

  it("returns true for 3 confirmations", () => {
    expect(isConfirmed(makeSpot(3))).toBe(true);
  });

  it("flips from false to true exactly between 1 and 2, not before or after", () => {
    expect(isConfirmed(makeSpot(1))).toBe(false);
    expect(isConfirmed(makeSpot(2))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { isConfirmed, type Spot } from "@/lib/spots";

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

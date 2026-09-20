import { describe, expect, it } from "vitest";
import { isWithinZamboangaCity, ZAMBOANGA_CITY_BOUNDS } from "@/lib/city-bounds";
import { validateNewSpot, type NewSpotInput } from "@/lib/validation";

/**
 * Adversarial pass on the Zamboanga City bounds contract (spec Task 1).
 * The frozen city-bounds.test.ts already covers the four corners and
 * +/-0.01deg outside each edge; this file goes narrower (a hair outside
 * each edge, per the ticket's exact values) and covers input shapes the
 * contract's prose implies but the frozen suite doesn't exercise: -0,
 * string-coerced numbers, and validateNewSpot with only one axis wrong.
 */

function validInput(overrides: Partial<NewSpotInput> = {}): NewSpotInput {
  return {
    name: "Fort Pilar",
    note: "Historic fort by the water, nice at sunset.",
    lat: 6.9098,
    lng: 122.079,
    photoFile: new File([new Uint8Array(1024)], "photo.jpg", { type: "image/jpeg" }),
    ...overrides,
  };
}

describe("adversarial", () => {
  describe("isWithinZamboangaCity -- a hair outside each edge", () => {
    it("is false 0.0001deg south of the south edge (6.7799)", () => {
      expect(isWithinZamboangaCity(6.7799, 122.0)).toBe(false);
    });

    it("is false 0.0001deg north of the north edge (7.4801)", () => {
      expect(isWithinZamboangaCity(7.4801, 122.0)).toBe(false);
    });

    it("is false 0.0001deg west of the west edge (121.7499)", () => {
      expect(isWithinZamboangaCity(6.9, 121.7499)).toBe(false);
    });

    it("is false 0.0001deg east of the east edge (122.5801)", () => {
      expect(isWithinZamboangaCity(6.9, 122.5801)).toBe(false);
    });

    it("is still true exactly on each edge, immediately next to the hair-outside cases above", () => {
      expect(isWithinZamboangaCity(ZAMBOANGA_CITY_BOUNDS.south, 122.0)).toBe(true);
      expect(isWithinZamboangaCity(ZAMBOANGA_CITY_BOUNDS.north, 122.0)).toBe(true);
      expect(isWithinZamboangaCity(6.9, ZAMBOANGA_CITY_BOUNDS.west)).toBe(true);
      expect(isWithinZamboangaCity(6.9, ZAMBOANGA_CITY_BOUNDS.east)).toBe(true);
    });
  });

  describe("isWithinZamboangaCity -- unusual numeric input", () => {
    it("is false for -0 in either coordinate (not a real Zamboanga location, just an IEEE-754 edge case)", () => {
      expect(isWithinZamboangaCity(-0, 122.0)).toBe(false);
      expect(isWithinZamboangaCity(6.9, -0)).toBe(false);
    });

    it("is false for string-coerced numbers even when the numeric value would be inside the box (Number.isFinite does not coerce strings, so this must reject rather than silently pass)", () => {
      const stringLat = "6.9" as unknown as number;
      const stringLng = "122.05" as unknown as number;
      expect(isWithinZamboangaCity(stringLat, 122.05)).toBe(false);
      expect(isWithinZamboangaCity(6.9, stringLng)).toBe(false);
      expect(isWithinZamboangaCity(stringLat, stringLng)).toBe(false);
    });
  });

  describe("validateNewSpot -- exactly one axis outside the city", () => {
    it("lat inside the box, lng outside (but inside -180..180): both lat and lng get the city error, per the documented both-fields contract", () => {
      const result = validateNewSpot(validInput({ lat: 6.9, lng: 124.0 }));
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.lat).toBe("Pins can only be placed inside Zamboanga City.");
        expect(result.errors.lng).toBe("Pins can only be placed inside Zamboanga City.");
      }
    });

    it("lng inside the box, lat outside (but inside -90..90): both lat and lng get the city error", () => {
      const result = validateNewSpot(validInput({ lat: 6.5, lng: 122.0 }));
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.lat).toBe("Pins can only be placed inside Zamboanga City.");
        expect(result.errors.lng).toBe("Pins can only be placed inside Zamboanga City.");
      }
    });

    it("lat a hair outside the north edge (7.4801), lng valid and inside the box, still yields the city error (not a false accept from float rounding)", () => {
      const result = validateNewSpot(validInput({ lat: 7.4801, lng: 122.079 }));
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.lat).toBe("Pins can only be placed inside Zamboanga City.");
      }
    });
  });
});

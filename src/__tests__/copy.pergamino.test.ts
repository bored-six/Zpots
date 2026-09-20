import { describe, expect, it } from "vitest";
import { COPY } from "@/lib/copy";

// Pergamino PRD, T1.5 (test 63): the raster-fallback chip's copy.

describe("COPY -- Pergamino fallback chip", () => {
  it("has 'simpleMap' with a non-empty cv and en, and cv !== en", () => {
    expect(typeof COPY.simpleMap.cv).toBe("string");
    expect(COPY.simpleMap.cv.trim().length).toBeGreaterThan(0);
    expect(typeof COPY.simpleMap.en).toBe("string");
    expect(COPY.simpleMap.en.trim().length).toBeGreaterThan(0);
    expect(COPY.simpleMap.cv).not.toBe(COPY.simpleMap.en);
  });

  it("has 'simpleMapWhy' with a non-empty cv and en, and cv !== en", () => {
    expect(typeof COPY.simpleMapWhy.cv).toBe("string");
    expect(COPY.simpleMapWhy.cv.trim().length).toBeGreaterThan(0);
    expect(typeof COPY.simpleMapWhy.en).toBe("string");
    expect(COPY.simpleMapWhy.en.trim().length).toBeGreaterThan(0);
    expect(COPY.simpleMapWhy.cv).not.toBe(COPY.simpleMapWhy.en);
  });
});

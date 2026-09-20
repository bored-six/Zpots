import { describe, expect, it } from "vitest";
import { COPY, type CopyKey } from "@/lib/copy";

/**
 * Adversarial pass on the copy contract (spec Task 4). The frozen
 * copy.test.ts already checks non-empty/ASCII-only cv+en per entry; this
 * adds the two checks the ticket calls out specifically: no entry where cv
 * and en are identical (that would mean the Chavacano translation step was
 * skipped for that string), and no trailing whitespace on either string.
 */
describe("adversarial", () => {
  const keys = Object.keys(COPY) as CopyKey[];

  it.each(keys)("entry '%s' has a Chavacano cv distinct from its English en (translation wasn't skipped)", (key) => {
    const entry = COPY[key];
    expect(entry.cv).not.toBe(entry.en);
    // Also guard the sloppier version of skipping: same text differing
    // only by case.
    expect(entry.cv.toLowerCase()).not.toBe(entry.en.toLowerCase());
  });

  it.each(keys)("entry '%s' has no trailing whitespace on cv or en", (key) => {
    const entry = COPY[key];
    expect(entry.cv).toBe(entry.cv.trimEnd());
    expect(entry.en).toBe(entry.en.trimEnd());
  });

  it.each(keys)("entry '%s' has no leading whitespace on cv or en either", (key) => {
    const entry = COPY[key];
    expect(entry.cv).toBe(entry.cv.trimStart());
    expect(entry.en).toBe(entry.en.trimStart());
  });
});

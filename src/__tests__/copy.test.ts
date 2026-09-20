import { describe, expect, it } from "vitest";
import { COPY, bilingualLabel, type CopyKey } from "@/lib/copy";

// Matches ASCII only -- Chavacano strings here are meant to be plain ASCII
// per the spec ("aqui", no accent), and ban emoji/non-ASCII across the
// board so a stray smart-quote or emoji can't sneak in unnoticed.
const NON_ASCII_PATTERN = /[^\x00-\x7F]/;

describe("COPY", () => {
  const keys = Object.keys(COPY) as CopyKey[];

  it("has at least the entries named in the spec", () => {
    const expectedKeys: CopyKey[] = [
      "addSpot",
      "tapToPlace",
      "confirmVisit",
      "report",
      "statusConfirmed",
      "statusUnconfirmed",
      "loading",
      "outsideCity",
      "signInFirst",
      "tagline",
      "cancel",
      "save",
    ];
    for (const key of expectedKeys) {
      expect(keys).toContain(key);
    }
  });

  // social-spots.md PRD ("Copy" section) -- feed/save/follow/profile/post copy
  // added for the social redesign. "save" already existed from the original
  // spec (Guarda / Save) and is asserted above; "been" reuses the existing
  // confirmVisit key rather than being a new entry.
  it("has at least the entries named in the social-spots PRD", () => {
    const expectedSocialKeys: CopyKey[] = [
      "spots",
      "cerca",
      "nuevo",
      "siguiendo",
      "hoy",
      "miMapa",
      "gente",
      "yo",
      "saved",
      "unsave",
      "follow",
      "unfollow",
      "followingState",
      "followers",
      "followingCount",
      "pickHandle",
      "handleTaken",
      "takePhoto",
      "choosePhoto",
      "whereIsIt",
      "usingCenter",
      "noSpotsYet",
      "emptyMap",
      "findPeople",
      "nobodyToday",
      "distanceAway",
      "droppedBy",
      "spotIsUp",
    ];
    for (const key of expectedSocialKeys) {
      expect(keys).toContain(key);
    }
  });

  it("spots is Spots/Spots -- a deliberate brand-word exception (see copy.adversarial.test.ts allowlist)", () => {
    expect(COPY.spots.cv).toBe("Spots");
    expect(COPY.spots.en).toBe("Spots");
  });

  it.each(keys)("entry '%s' has a non-empty cv and en string", (key) => {
    const entry = COPY[key];
    expect(typeof entry.cv).toBe("string");
    expect(entry.cv.trim().length).toBeGreaterThan(0);
    expect(typeof entry.en).toBe("string");
    expect(entry.en.trim().length).toBeGreaterThan(0);
  });

  it.each(keys)("entry '%s' contains no emoji or non-ASCII characters in cv or en", (key) => {
    const entry = COPY[key];
    expect(entry.cv).not.toMatch(NON_ASCII_PATTERN);
    expect(entry.en).not.toMatch(NON_ASCII_PATTERN);
  });

  it("confirmVisit's English secondary is exactly \"I've been here\"", () => {
    expect(COPY.confirmVisit.en).toBe("I've been here");
  });
});

describe("bilingualLabel", () => {
  it("returns the English string for a given key, for use as an aria-label", () => {
    expect(bilingualLabel("confirmVisit")).toBe("I've been here");
    expect(bilingualLabel("report")).toBe("Report");
    expect(bilingualLabel("addSpot")).toBe("Add a spot");
  });
});

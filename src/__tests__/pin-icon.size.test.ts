import { describe, expect, it } from "vitest";
import { createPinIcon } from "@/lib/pin-icon";

/**
 * grabado-pins spec, section 10.3, revised by section 14.10 for revision 2
 * (no photo on any pin; four-tier ladder [32, 22, 16, 10]).
 *
 * THIS FILE IS EXPECTED TO FAIL RED against the revision-1 implementation:
 * the ladder is still five rungs (tier numbering off by one), size 16 is
 * still a closed-only rose, size 10 is still tagged tier-4, and
 * `createPhotoPinIcon` still exists as an export.
 */
describe("createPinIcon -- density ladder sizing", () => {
  it("defaults to size 22 with the frozen anchors, tagged tier-1", () => {
    const icon = createPinIcon("confirmed");
    expect(icon.options.iconSize).toEqual([22, 22]);
    expect(icon.options.iconAnchor).toEqual([11, 21]);
    expect(icon.options.popupAnchor).toEqual([0, -19]);
    expect(String(icon.options.className ?? "")).toMatch(/\bzpots-pin-icon--tier-1\b/);
  });

  it("size 32 -> iconSize [32,32], iconAnchor [16,30], popupAnchor [0,-28], tagged tier-0", () => {
    const icon = createPinIcon("confirmed", { size: 32 });
    expect(icon.options.iconSize).toEqual([32, 32]);
    expect(icon.options.iconAnchor).toEqual([16, 30]);
    expect(icon.options.popupAnchor).toEqual([0, -28]);
    expect(String(icon.options.className ?? "")).toMatch(/\bzpots-pin-icon--tier-0\b/);
  });

  it("size 16 renders the category glyph when one is set, tagged tier-2", () => {
    const icon = createPinIcon("confirmed", { size: 16, category: "come" });
    expect(icon.options.iconSize).toEqual([16, 16]);
    expect(icon.options.iconAnchor).toEqual([8, 15]);
    expect(icon.options.popupAnchor).toEqual([0, -14]);
    expect(String(icon.options.html)).toContain("data-glyph");
    expect(String(icon.options.className ?? "")).toMatch(/\bzpots-pin-icon--tier-2\b/);
  });

  it("size 10 is a punto with no glyph and no seal, tagged tier-3", () => {
    const icon = createPinIcon("confirmed", { size: 10, category: "come" });
    expect(icon.options.iconSize).toEqual([10, 10]);
    expect(icon.options.iconAnchor).toEqual([5, 5]);
    expect(icon.options.popupAnchor).toEqual([0, -6]);
    expect(String(icon.options.html)).not.toContain("data-glyph");
    expect(String(icon.options.html)).not.toContain('data-part="seal"');
    expect(String(icon.options.className ?? "")).toMatch(/\bzpots-pin-icon--tier-3\b/);
  });

  it("className carries the matching tier for every size, and only tags punto at size 10", () => {
    const size32 = String(createPinIcon("confirmed", { size: 32 }).options.className ?? "");
    expect(size32).toMatch(/\bzpots-pin-icon--tier-0\b/);
    expect(size32).not.toMatch(/\bzpots-pin-icon--punto\b/);

    const size22 = String(createPinIcon("confirmed", { size: 22 }).options.className ?? "");
    expect(size22).toMatch(/\bzpots-pin-icon--tier-1\b/);
    expect(size22).not.toMatch(/\bzpots-pin-icon--punto\b/);

    const size16 = String(createPinIcon("confirmed", { size: 16 }).options.className ?? "");
    expect(size16).toMatch(/\bzpots-pin-icon--tier-2\b/);
    expect(size16).not.toMatch(/\bzpots-pin-icon--punto\b/);

    const size10 = String(createPinIcon("confirmed", { size: 10 }).options.className ?? "");
    expect(size10).toMatch(/\bzpots-pin-icon--tier-3\b/);
    expect(size10).toMatch(/\bzpots-pin-icon--punto\b/);
  });

  it("a size outside the ladder throws a RangeError", () => {
    expect(() => createPinIcon("confirmed", { size: 24 as never })).toThrow(RangeError);
  });

  it("size 44 throws a RangeError -- 44 is no longer in the ladder", () => {
    expect(() => createPinIcon("confirmed", { size: 44 as never })).toThrow(RangeError);
  });
});

describe("createPinIcon -- no photo factory left to import", () => {
  it("the module exports no createPhotoPinIcon", async () => {
    const pinIcon = await import("@/lib/pin-icon");
    expect((pinIcon as Record<string, unknown>).createPhotoPinIcon).toBeUndefined();
  });
});

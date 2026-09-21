import { describe, expect, it } from "vitest";
import { createPhotoPinIcon, createPinIcon } from "@/lib/pin-icon";

/**
 * grabado-pins spec, section 10.3 -- the density ladder (`size` option) on
 * `createPinIcon`/`createPhotoPinIcon`.
 *
 * THIS FILE IS EXPECTED TO FAIL RED: `pin-icon.ts` does not accept a `size`
 * option yet, never throws a `RangeError`, and has no `--tier-*`/`--punto`
 * classes or glyph/seal markup to gate. Several assertions below describe
 * behaviour that also happens to be already true today (e.g. the unchanged
 * default anchors) -- those are folded into a test that also asserts a new,
 * currently-missing behaviour, so every test here genuinely fails now. Do
 * not weaken an assertion just because part of its `it` already passes.
 */
describe("createPinIcon -- density ladder sizing", () => {
  it("defaults to size 22 with the frozen anchors, tagged tier-2", () => {
    const icon = createPinIcon("confirmed");
    expect(icon.options.iconSize).toEqual([22, 22]);
    expect(icon.options.iconAnchor).toEqual([11, 21]);
    expect(icon.options.popupAnchor).toEqual([0, -19]);
    expect(String(icon.options.className ?? "")).toMatch(/\bzpots-pin-icon--tier-2\b/);
  });

  it("size 32 -> iconSize [32,32], iconAnchor [16,30], popupAnchor [0,-28]", () => {
    const icon = createPinIcon("confirmed", { size: 32 });
    expect(icon.options.iconSize).toEqual([32, 32]);
    expect(icon.options.iconAnchor).toEqual([16, 30]);
    expect(icon.options.popupAnchor).toEqual([0, -28]);
  });

  it("size 16 is a closed rose with no glyph, even with a category set", () => {
    const icon = createPinIcon("confirmed", { size: 16, category: "come" });
    expect(icon.options.iconSize).toEqual([16, 16]);
    expect(icon.options.iconAnchor).toEqual([8, 15]);
    expect(icon.options.popupAnchor).toEqual([0, -14]);
    expect(String(icon.options.html)).not.toContain("data-glyph");
  });

  it("size 10 is a punto with no glyph and no seal", () => {
    const icon = createPinIcon("confirmed", { size: 10, category: "come" });
    expect(icon.options.iconSize).toEqual([10, 10]);
    expect(icon.options.iconAnchor).toEqual([5, 5]);
    expect(icon.options.popupAnchor).toEqual([0, -6]);
    expect(String(icon.options.html)).not.toContain("data-glyph");
    expect(String(icon.options.html)).not.toContain('data-part="seal"');
  });

  it("className carries the matching tier for every size, and only tags punto at size 10", () => {
    const size32 = String(createPinIcon("confirmed", { size: 32 }).options.className ?? "");
    expect(size32).toMatch(/\bzpots-pin-icon--tier-1\b/);
    expect(size32).not.toMatch(/\bzpots-pin-icon--punto\b/);

    const size22 = String(createPinIcon("confirmed", { size: 22 }).options.className ?? "");
    expect(size22).toMatch(/\bzpots-pin-icon--tier-2\b/);
    expect(size22).not.toMatch(/\bzpots-pin-icon--punto\b/);

    const size16 = String(createPinIcon("confirmed", { size: 16 }).options.className ?? "");
    expect(size16).toMatch(/\bzpots-pin-icon--tier-3\b/);
    expect(size16).not.toMatch(/\bzpots-pin-icon--punto\b/);

    const size10 = String(createPinIcon("confirmed", { size: 10 }).options.className ?? "");
    expect(size10).toMatch(/\bzpots-pin-icon--tier-4\b/);
    expect(size10).toMatch(/\bzpots-pin-icon--punto\b/);
  });

  it("a size outside the ladder throws a RangeError", () => {
    expect(() => createPinIcon("confirmed", { size: 24 as never })).toThrow(RangeError);
  });
});

describe("createPhotoPinIcon -- density ladder sizing", () => {
  const url = "https://example.com/spot.jpg";

  it("default size 44 keeps the existing anchors and 23px hole, and gains a status class", () => {
    const icon = createPhotoPinIcon(url, "confirmed");
    expect(icon.options.iconSize).toEqual([44, 44]);
    expect(icon.options.iconAnchor).toEqual([22, 41]);
    expect(icon.options.popupAnchor).toEqual([0, -38]);
    expect(String(icon.options.html)).toContain("width:23px");
    expect(String(icon.options.className ?? "")).toMatch(/\bzpots-pin-icon--confirmed\b/);
  });

  it("size 32 -> iconSize [32,32], iconAnchor [16,30], popupAnchor [0,-28], 17px hole", () => {
    const icon = createPhotoPinIcon(url, "confirmed", { size: 32 });
    expect(icon.options.iconSize).toEqual([32, 32]);
    expect(icon.options.iconAnchor).toEqual([16, 30]);
    expect(icon.options.popupAnchor).toEqual([0, -28]);
    expect(String(icon.options.html)).toContain("width:17px");
  });

  it("size 22 throws a RangeError -- not a valid PhotoPinSize", () => {
    expect(() => createPhotoPinIcon(url, "confirmed", { size: 22 as never })).toThrow(RangeError);
  });

  it("className contains photo, the status word, and tier-0", () => {
    const className = String(createPhotoPinIcon(url, "confirmed").options.className ?? "");
    expect(className).toMatch(/\bzpots-pin-icon--photo\b/);
    expect(className).toMatch(/\bzpots-pin-icon--confirmed\b/);
    expect(className).toMatch(/\bzpots-pin-icon--tier-0\b/);
  });

  it("html draws the petal arcs exactly four times, the N petal, and never the tail or a full kite", () => {
    const html = String(createPhotoPinIcon(url, "confirmed").options.html);
    const arcMatches = html.match(/A8\.5,8\.5 0 0 0/g) ?? [];
    expect(arcMatches).toHaveLength(4);
    expect(html).toContain("M14.19,7.7 L16,2 L17.81,7.7");
    expect(html).not.toContain("M13.5,22");
    expect(html).not.toContain("L12.5,13");
  });
});

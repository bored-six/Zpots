import { describe, expect, it } from "vitest";
import { createPinIcon } from "@/lib/pin-icon";

/**
 * grabado-pins spec, section 10.4, revised by section 14.10 for revision 2
 * (no photo on any pin; the glyph now also renders at size 16).
 *
 * THIS FILE IS EXPECTED TO FAIL RED against the revision-1 implementation:
 * size 16 is still closed-only (no `data-glyph`), so both the open-ring
 * test and the byte-identical-across-sizes test fail.
 */
const CATEGORY_ORDER = ["come", "senta", "camina", "agua", "mira", "compra"] as const;

describe("createPinIcon -- category glyph", () => {
  it("unconfirmed + agua: glyph, window ring, and both glyph colours are present", () => {
    const html = String(createPinIcon("unconfirmed", { category: "agua" }).options.html);
    expect(html).toContain('data-glyph="agua"');
    expect(html).toContain("<circle");
    expect(html).toContain('r="8.5"');
    expect(html).toContain("#2a2017");
    expect(html).toContain("#7a6448");

    const firstPath = html.match(/<path[^>]*>/)?.[0] ?? "";
    expect(firstPath).toContain('stroke="#f6eedc"');
  });

  it("confirmed + agua: glyph, seal, and both colours are present", () => {
    const html = String(createPinIcon("confirmed", { category: "agua" }).options.html);
    expect(html).toContain('data-glyph="agua"');
    expect(html).toContain('data-part="seal"');
    expect(html).toContain("#1f6f78");
    expect(html).toContain("#2a2017");
  });

  it("no category leaves the closed rose alone: no glyph, centre mark only; the seal band is exactly one r=8.5 circle when confirmed", () => {
    const unconfirmedHtml = String(createPinIcon("unconfirmed").options.html);
    expect(unconfirmedHtml).not.toContain("data-glyph");
    expect(unconfirmedHtml).not.toContain('r="8.5"');
    expect(unconfirmedHtml).toContain('r="1.6"');

    const confirmedHtml = String(createPinIcon("confirmed").options.html);
    expect(confirmedHtml).not.toContain("data-glyph");
    const sealBandMatches = confirmedHtml.match(/r="8\.5"/g) ?? [];
    expect(sealBandMatches).toHaveLength(1);
    expect(confirmedHtml).toContain('fill="none"');
    expect(confirmedHtml).toContain('r="2"');
    expect(confirmedHtml).toContain('fill="#f6eedc"');
  });

  it("each of the six categories produces distinct markup", () => {
    const htmls = CATEGORY_ORDER.map((category) =>
      String(createPinIcon("unconfirmed", { category }).options.html),
    );
    expect(new Set(htmls).size).toBe(CATEGORY_ORDER.length);
  });

  it("the glyph markup for a given category is status-independent (byte-identical between statuses)", () => {
    const unconfirmedHtml = String(
      createPinIcon("unconfirmed", { category: "come" }).options.html,
    );
    const confirmedHtml = String(createPinIcon("confirmed", { category: "come" }).options.html);
    const extractGlyph = (html: string) => html.match(/<g data-glyph="come">[\s\S]*?<\/g>/)?.[0];
    expect(extractGlyph(confirmedHtml)).toBeTruthy();
    expect(extractGlyph(confirmedHtml)).toBe(extractGlyph(unconfirmedHtml));
  });

  it("the open unconfirmed window ring is stroke-width 1.2 with an r=8.5 window at every glyph-eligible size", () => {
    for (const size of [32, 22, 16] as const) {
      const html = String(createPinIcon("unconfirmed", { category: "agua", size }).options.html);
      expect(html).toContain('stroke-width="1.2"');
      expect(html).toContain('r="8.5"');
    }
  });

  it("size 16 with a category renders the glyph", () => {
    const html = String(createPinIcon("unconfirmed", { category: "agua", size: 16 }).options.html);
    expect(html).toContain('data-glyph="agua"');
  });

  it("the glyph markup for a category is byte-identical across every glyph-eligible size", () => {
    const extractGlyph = (html: string) => html.match(/<g data-glyph="come">[\s\S]*?<\/g>/)?.[0];
    const glyphs = [32, 22, 16].map((size) =>
      extractGlyph(String(createPinIcon("unconfirmed", { category: "come", size }).options.html)),
    );
    expect(glyphs[0]).toBeTruthy();
    expect(glyphs[1]).toBe(glyphs[0]);
    expect(glyphs[2]).toBe(glyphs[0]);
  });

  it("an invalid category is treated as undefined (E1)", () => {
    const validHtml = String(createPinIcon("confirmed", { category: "come" }).options.html);
    expect(validHtml).toContain('data-glyph="come"');

    const invalidHtml = String(
      createPinIcon("confirmed", { category: "not-a-category" as never }).options.html,
    );
    expect(invalidHtml).not.toContain("data-glyph");
  });
});

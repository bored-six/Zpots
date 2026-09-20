import { describe, expect, it } from "vitest";
import { createPinIcon } from "@/lib/pin-icon";

/**
 * Snapshot-free by design (per spec): asserts on the DivIcon's own options
 * (iconSize/iconAnchor/popupAnchor/className) and on the two allowed hex
 * colors, never on the SVG's full markup shape.
 */
describe("createPinIcon -- smaller, sharper redesign", () => {
  it("confirmed icon has iconSize [22,22], iconAnchor [11,21], popupAnchor [0,-19]", () => {
    const icon = createPinIcon("confirmed");
    expect(icon.options.iconSize).toEqual([22, 22]);
    expect(icon.options.iconAnchor).toEqual([11, 21]);
    expect(icon.options.popupAnchor).toEqual([0, -19]);
  });

  it("unconfirmed icon has the same iconSize/iconAnchor/popupAnchor as confirmed", () => {
    const icon = createPinIcon("unconfirmed");
    expect(icon.options.iconSize).toEqual([22, 22]);
    expect(icon.options.iconAnchor).toEqual([11, 21]);
    expect(icon.options.popupAnchor).toEqual([0, -19]);
  });

  it("confirmed icon's className contains both zpots-pin-icon and zpots-pin-icon--confirmed", () => {
    const icon = createPinIcon("confirmed");
    const className = String(icon.options.className ?? "");
    expect(className).toMatch(/\bzpots-pin-icon\b/);
    expect(className).toMatch(/\bzpots-pin-icon--confirmed\b/);
  });

  it("unconfirmed icon's className contains both zpots-pin-icon and zpots-pin-icon--unconfirmed", () => {
    const icon = createPinIcon("unconfirmed");
    const className = String(icon.options.className ?? "");
    expect(className).toMatch(/\bzpots-pin-icon\b/);
    expect(className).toMatch(/\bzpots-pin-icon--unconfirmed\b/);
  });

  it("confirmed icon's html contains the teal token color #1f6f78", () => {
    const icon = createPinIcon("confirmed");
    expect(String(icon.options.html)).toContain("#1f6f78");
  });

  it("unconfirmed icon's html contains the stone-deep token color #7a6448 and fill-opacity=\"0.85\"", () => {
    const icon = createPinIcon("unconfirmed");
    const html = String(icon.options.html);
    expect(html).toContain("#7a6448");
    expect(html).toContain('fill-opacity="0.85"');
  });

  it("neither icon's html contains a stroke=\"white\" halo (replaced by the cream token color)", () => {
    const confirmedHtml = String(createPinIcon("confirmed").options.html);
    const unconfirmedHtml = String(createPinIcon("unconfirmed").options.html);
    expect(confirmedHtml).not.toContain('stroke="white"');
    expect(unconfirmedHtml).not.toContain('stroke="white"');
  });
});

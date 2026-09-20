// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Adversarial pass on the tile-tint cascade ordering (spec Task 2). CSS
 * cascade rules mean the tint filter only "wins" over Leaflet's own
 * stylesheet if it's loaded later, at equal selector specificity. Two
 * places this can silently break: the `@import`/rule order inside
 * globals.css itself, and the file import order in layout.tsx (which
 * decides which stylesheet's rules land first in the final bundle).
 */
const GLOBALS_CSS_PATH = path.join(process.cwd(), "src/app/globals.css");
const LAYOUT_PATH = path.join(process.cwd(), "src/app/layout.tsx");

function readGlobalsCss(): string {
  return fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");
}

function readLayoutSource(): string {
  return fs.readFileSync(LAYOUT_PATH, "utf-8");
}

describe("adversarial", () => {
  it("the .leaflet-tile-pane filter rule in globals.css appears after every @import statement in that file", () => {
    const css = readGlobalsCss();
    const importIndices = [...css.matchAll(/@import\b/g)].map((m) => m.index ?? -1);
    expect(importIndices.length).toBeGreaterThan(0);

    const tileRuleIndex = css.indexOf(".leaflet-tile-pane");
    expect(tileRuleIndex).toBeGreaterThan(-1);

    for (const importIndex of importIndices) {
      expect(tileRuleIndex).toBeGreaterThan(importIndex);
    }
  });

  it("layout.tsx imports Leaflet's own stylesheet before globals.css, so globals.css's tile-pane filter loads later in the bundle and wins the cascade at equal specificity", () => {
    const source = readLayoutSource();
    const leafletCssIndex = source.indexOf('"leaflet/dist/leaflet.css"');
    const globalsCssIndex = source.indexOf('"./globals.css"');

    expect(leafletCssIndex).toBeGreaterThan(-1);
    expect(globalsCssIndex).toBeGreaterThan(-1);
    expect(leafletCssIndex).toBeLessThan(globalsCssIndex);
  });

  it(".zpots-pin-icon is never selected as a descendant of .leaflet-tile-pane -- markers must stay in their own pane, untinted", () => {
    const css = readGlobalsCss();
    const selectorLines = css.match(/^[^{}]*\{/gm) ?? [];

    const offendingSelectors = selectorLines.filter(
      (selector) => selector.includes(".leaflet-tile-pane") && selector.includes(".zpots-pin-icon"),
    );

    expect(offendingSelectors).toEqual([]);
  });

  it("the .leaflet-tile-pane rule's filter does not touch opacity to zero or otherwise hide tiles (sanity: it's a tint, not a kill-switch)", () => {
    const css = readGlobalsCss();
    const ruleMatch = css.match(/\.leaflet-tile-pane\s*\{([^}]*)\}/);
    expect(ruleMatch).not.toBeNull();
    const body = ruleMatch ? ruleMatch[1] : "";
    expect(body).not.toMatch(/opacity\s*:\s*0\b/);
    expect(body).not.toMatch(/display\s*:\s*none/);
  });
});

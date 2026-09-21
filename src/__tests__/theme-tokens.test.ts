// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Reads globals.css as plain text rather than loading it through a CSS
 * parser/PostCSS pipeline -- Tailwind v4's `@theme` block is plain CSS
 * custom-property syntax, so a text/regex check is enough and keeps this
 * test fast and dependency-free.
 */
const GLOBALS_CSS_PATH = path.join(process.cwd(), "src/app/globals.css");

function readGlobalsCss(): string {
  return fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");
}

const EXPECTED_TOKENS: Record<string, string> = {
  "--color-cream": "#f6eedc",
  "--color-cream-deep": "#ecdfc3",
  "--color-stone": "#cdb693",
  "--color-stone-deep": "#7a6448",
  "--color-ink": "#2a2017",
  "--color-tinta": "#1f1813",
  "--color-terracotta": "#b5482c",
  "--color-terracotta-deep": "#8f3620",
  "--color-teal": "#1f6f78",
  "--color-teal-deep": "#165259",
  "--color-forest-deep": "#3d5c2f",
  "--color-cardinal": "#9b2d20",
  "--color-vinta-red": "#c8342b",
  "--color-vinta-yellow": "#e8b63a",
  "--color-vinta-blue": "#2c62a8",
  "--color-vinta-green": "#2e8b57",
};

describe("globals.css design tokens", () => {
  for (const [name, hex] of Object.entries(EXPECTED_TOKENS)) {
    it(`declares ${name}: ${hex}`, () => {
      const css = readGlobalsCss();
      const pattern = new RegExp(
        `${name.replace(/-/g, "\\-")}\\s*:\\s*${hex}\\b`,
        "i",
      );
      expect(css).toMatch(pattern);
    });
  }

  it("no --zpots- prefixed variable remains", () => {
    const css = readGlobalsCss();
    expect(css).not.toMatch(/--zpots-/);
  });

  it(".vinta-rule exists as a gradient rule using all four vinta colors", () => {
    const css = readGlobalsCss();
    expect(css).toMatch(/\.vinta-rule\s*\{[^}]*\}/);
    const ruleMatch = css.match(/\.vinta-rule\s*\{([^}]*)\}/);
    expect(ruleMatch).not.toBeNull();
    const body = ruleMatch ? ruleMatch[1] : "";
    expect(body).toMatch(/var\(--color-vinta-red\)/);
    expect(body).toMatch(/var\(--color-vinta-yellow\)/);
    expect(body).toMatch(/var\(--color-vinta-blue\)/);
    expect(body).toMatch(/var\(--color-vinta-green\)/);
  });

  it(".leaflet-tile-pane carries the sepia tint filter, and nothing else in that rule un-crisps markers", () => {
    const css = readGlobalsCss();
    const ruleMatch = css.match(/\.leaflet-tile-pane\s*\{([^}]*)\}/);
    expect(ruleMatch).not.toBeNull();
    const body = ruleMatch ? ruleMatch[1] : "";
    expect(body).toMatch(/filter\s*:\s*[^;]*sepia\(/);
  });

  it(".leaflet-container sets the cream-deep background and body font", () => {
    const css = readGlobalsCss();
    const ruleMatch = css.match(/\.leaflet-container\s*\{([^}]*)\}/);
    expect(ruleMatch).not.toBeNull();
    const body = ruleMatch ? ruleMatch[1] : "";
    expect(body).toMatch(/var\(--color-cream-deep\)/);
    expect(body).toMatch(/var\(--font-body\)/);
  });
});

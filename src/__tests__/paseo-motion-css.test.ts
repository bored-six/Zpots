// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Reads globals.css as plain text -- same approach as theme-tokens.test.ts
 * and pergamino-tokens.test.ts -- since Tailwind v4's `@theme` block and
 * plain rule bodies are regular CSS custom-property syntax and don't need
 * a parser to check.
 *
 * This file locks down the Wave 1 CSS contract from
 * .claude/prds/paseo-motion.md ("CSS contract" section) so Wave 2 agents
 * can consume the tokens/keyframes/classes by name without re-deriving
 * them, and so a later edit to globals.css can't silently drop a hook.
 */
const GLOBALS_CSS_PATH = path.join(process.cwd(), "src/app/globals.css");

function readGlobalsCss(): string {
  return fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");
}

function extractRuleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ruleMatch = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return ruleMatch ? ruleMatch[1] : "";
}

/**
 * Extracts the first `@theme { ... }` block (not `@theme inline { ... }`,
 * which has "inline" between "@theme" and "{" so it doesn't match this
 * pattern). Same one-level assumption as the existing token tests: the
 * plain @theme block only ever holds flat custom-property declarations,
 * no nested rules.
 */
function extractThemeBlock(css: string): string {
  const match = css.match(/@theme\s*\{([^}]*)\}/);
  return match ? match[1] : "";
}

/**
 * The reduced-motion media block nests a rule (`*, *::before, *::after {
 * ... }`) inside it, so it has one level of nested braces and the simple
 * `[^}]*` trick used elsewhere in this file won't capture the whole thing.
 * Walk the braces by hand instead of trying to force it through a regex.
 */
function extractBalancedBlock(css: string, startIndex: number): string | null {
  const openIndex = css.indexOf("{", startIndex);
  if (openIndex === -1) return null;
  let depth = 0;
  for (let i = openIndex; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") {
      depth--;
      if (depth === 0) {
        return css.slice(openIndex, i + 1);
      }
    }
  }
  return null;
}

const MOTION_TOKENS = [
  "--ease-paseo",
  "--ease-settle",
  "--dur-fast",
  "--dur-base",
  "--dur-slow",
];

const KEYFRAME_NAMES = [
  "paseo-photo-settle",
  "paseo-veil-rise",
  "paseo-line-rise",
  "paseo-ken-burns",
  "paseo-mark-draw",
  "paseo-ring-pulse",
  "paseo-vinta-spin",
];

const HOOK_SELECTORS = [
  ".paseo-photo",
  ".paseo-veil",
  ".paseo-line",
  ".paseo-mark",
  ".paseo-confirm-pulse",
  ".zpots-pin-icon--just-confirmed",
];

describe("paseo motion CSS contract (globals.css)", () => {
  it("declares all five motion tokens in the @theme block", () => {
    const themeBlock = extractThemeBlock(readGlobalsCss());
    for (const token of MOTION_TOKENS) {
      const pattern = new RegExp(`${token.replace(/-/g, "\\-")}\\s*:`);
      expect(themeBlock, `${token} not found in @theme block`).toMatch(
        pattern,
      );
    }
  });

  it("no custom property in the file starts with --zpots-", () => {
    const css = readGlobalsCss();
    expect(css).not.toMatch(/--zpots-/);
  });

  it("declares all seven @keyframes from the PRD table", () => {
    const css = readGlobalsCss();
    for (const name of KEYFRAME_NAMES) {
      const pattern = new RegExp(`@keyframes\\s+${name}\\s*\\{`);
      expect(css, `@keyframes ${name} not found`).toMatch(pattern);
    }
  });

  it("declares @property --vinta-angle with syntax: \"<angle>\"", () => {
    const css = readGlobalsCss();
    const match = css.match(/@property\s+--vinta-angle\s*\{([^}]*)\}/);
    expect(match, "@property --vinta-angle not found").not.toBeNull();
    const body = match ? match[1] : "";
    expect(body).toMatch(/syntax\s*:\s*["']<angle>["']/);
    expect(body).toMatch(/inherits\s*:\s*false/);
    expect(body).toMatch(/initial-value\s*:\s*0deg/);
  });

  it("has a top-level @media (prefers-reduced-motion: reduce) block that turns off animation and transition", () => {
    const css = readGlobalsCss();
    const startIndex = css.search(
      /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/,
    );
    expect(startIndex, "@media (prefers-reduced-motion: reduce) not found").toBeGreaterThan(
      -1,
    );
    const block = extractBalancedBlock(css, startIndex);
    expect(block, "could not find a balanced block for the media query").not.toBeNull();
    const body = block ?? "";
    expect(body).toMatch(/animation\s*:\s*none/);
    expect(body).toMatch(/transition\s*:\s*none/);
  });

  it("the reduced-motion block is not nested inside .vinta-rule, .leaflet-container, or .leaflet-tile-pane", () => {
    const css = readGlobalsCss();
    for (const selector of [
      ".vinta-rule",
      ".leaflet-container",
      ".leaflet-tile-pane",
    ]) {
      const body = extractRuleBody(css, selector);
      expect(body, `${selector} unexpectedly contains @media`).not.toMatch(
        /@media/,
      );
    }
  });

  for (const selector of HOOK_SELECTORS) {
    it(`declares a rule for ${selector}`, () => {
      const css = readGlobalsCss();
      const body = extractRuleBody(css, selector);
      expect(body, `${selector} rule not found`).not.toBe("");
    });
  }

  it('declares a rule for .vinta-ring[data-fresh="true"]', () => {
    const css = readGlobalsCss();
    const body = extractRuleBody(css, '.vinta-ring[data-fresh="true"]');
    expect(body, '.vinta-ring[data-fresh="true"] rule not found').not.toBe(
      "",
    );
  });

  it("scopes the ken-burns and settle animations under .paseo-slot[data-active=\"true\"]", () => {
    const css = readGlobalsCss();
    const body = extractRuleBody(
      css,
      '.paseo-slot[data-active="true"] .paseo-photo',
    );
    expect(
      body,
      '.paseo-slot[data-active="true"] .paseo-photo rule not found',
    ).not.toBe("");
    expect(body).toMatch(/paseo-photo-settle/);
    expect(body).toMatch(/paseo-ken-burns/);
  });
});

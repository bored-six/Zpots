// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  PERGAMINO_FALLBACK_HEX,
  PERGAMINO_TOKEN_NAMES,
} from "@/lib/pergamino-palette";

/**
 * Reads globals.css as plain text -- same approach as theme-tokens.test.ts
 * -- since Tailwind v4's `@theme` block and plain rule bodies are regular
 * CSS custom-property syntax and don't need a parser to check.
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
 * The approved ground palette, transcribed from the PRD's "Original
 * requirements" table (.claude/prds/pergamino-map.md) independently of
 * PERGAMINO_FALLBACK_HEX, so a bug that makes the fallback map agree with
 * itself can't hide here. Test 3 below is the one that ties globals.css
 * and PERGAMINO_FALLBACK_HEX together (the anti-drift lock).
 */
const EXPECTED_GROUND_TOKENS: Record<string, string> = {
  "--color-pergamino-land": "#e9debf",
  "--color-pergamino-sea": "#d6be92",
  "--color-pergamino-coast": "#8a7048",
  "--color-pergamino-major": "#9d7b46",
  "--color-pergamino-arterial": "#b5945f",
  "--color-pergamino-street": "#c5a87d",
  "--color-pergamino-minor": "#d5c09a",
  "--color-pergamino-river": "#a9b79e",
  // Step 2 (pergamino-map.md): landuse groups, buildings, boundaries --
  // the layers that give the map its texture/depth.
  "--color-pergamino-green": "#cbd0a8",
  "--color-pergamino-civic": "#e2d3c4",
  "--color-pergamino-works": "#dfd1ac",
  "--color-pergamino-cemetery": "#ccc9ac",
  "--color-pergamino-aeroway": "#e4d9c0",
  "--color-pergamino-building": "#dccaa3",
  "--color-pergamino-building-edge": "#bfa574",
  "--color-pergamino-boundary": "#a58d64",
};

describe("Pergamino ground tokens (globals.css)", () => {
  // Test 1: globals.css declares each of the eight tokens with exactly
  // the approved hex.
  for (const [name, hex] of Object.entries(EXPECTED_GROUND_TOKENS)) {
    it(`declares ${name}: ${hex}`, () => {
      const css = readGlobalsCss();
      const pattern = new RegExp(
        `${name.replace(/-/g, "\\-")}\\s*:\\s*${hex}\\b`,
        "i",
      );
      expect(css).toMatch(pattern);
    });
  }

  // Test 2: PERGAMINO_FALLBACK_HEX has exactly PERGAMINO_TOKEN_NAMES as
  // its keys -- no more, no fewer.
  it("PERGAMINO_FALLBACK_HEX has exactly PERGAMINO_TOKEN_NAMES as its keys", () => {
    const fallbackKeys = Object.keys(PERGAMINO_FALLBACK_HEX).sort();
    const tokenNames = [...PERGAMINO_TOKEN_NAMES].sort();
    expect(fallbackKeys).toEqual(tokenNames);
  });

  // Test 3: the anti-drift lock -- for every token, PERGAMINO_FALLBACK_HEX
  // string-equals the value parsed out of globals.css.
  it("PERGAMINO_FALLBACK_HEX matches globals.css for every token (anti-drift lock)", () => {
    const css = readGlobalsCss();
    for (const name of PERGAMINO_TOKEN_NAMES) {
      const pattern = new RegExp(
        `${name.replace(/-/g, "\\-")}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\b`,
      );
      const match = css.match(pattern);
      expect(match, `${name} not declared in globals.css`).not.toBeNull();
      expect(PERGAMINO_FALLBACK_HEX[name]).toBe(match?.[1]);
    }
  });

  // Test 5: globals.css still contains the .leaflet-tile-pane sepia rule
  // -- the raster fallback (D6) depends on it.
  it("still contains the .leaflet-tile-pane sepia rule", () => {
    const css = readGlobalsCss();
    const body = extractRuleBody(css, ".leaflet-tile-pane");
    expect(body).toMatch(/filter\s*:\s*[^;]*sepia\(/);
  });

  // Test 6: .zpots-place-label--landmark/--barangay/--water exist and use
  // only var(--...) colours -- no `#` hex literal in the rule bodies.
  it("declares .zpots-place-label--landmark/--barangay/--water using only var(--...) colours", () => {
    const css = readGlobalsCss();
    for (const kind of ["landmark", "barangay", "water"]) {
      const body = extractRuleBody(css, `.zpots-place-label--${kind} span`);
      expect(body, `.zpots-place-label--${kind} span rule not found`).not.toBe(
        "",
      );
      expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      expect(body).toMatch(/var\(--color-/);
    }
  });
});

/**
 * Test 4 from the PRD's Test plan --
 * "Every fillToken/strokeToken referenced by PERGAMINO_LAYERS is a member
 * of PERGAMINO_TOKEN_NAMES" -- is deliberately NOT included in this file.
 *
 * PERGAMINO_LAYERS is defined in src/lib/pergamino-style.ts, which is
 * task T1.2's file, not T1.1's. T1.1 is scoped to exactly
 * src/app/globals.css, src/lib/pergamino-palette.ts and this test file;
 * pergamino-style.ts does not exist yet at the time this task runs, and
 * the Wave 1 table in the PRD lists T1.1 and T1.2 as having no dependency
 * on each other. A static import of PERGAMINO_LAYERS here would either
 * crash this whole file's test collection (module not found) or fail
 * `tsc --noEmit` (no type declarations to resolve), for reasons that have
 * nothing to do with this task's own token contract. See this task's
 * handoff notes for the recommendation: move test 4 into
 * pergamino-style.test.ts (T1.2), importing PERGAMINO_TOKEN_NAMES from
 * this file's module instead.
 */

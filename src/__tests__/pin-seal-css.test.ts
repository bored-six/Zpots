// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * grabado-pins spec, section 10.7 -- the "sello" CSS contract (section 4.7),
 * checked as plain text the same way `paseo-motion-css.test.ts` checks
 * globals.css: no parser, just balanced-brace/regex extraction, since this
 * repo's `@theme`/rule bodies are flat custom-property syntax. The
 * `readGlobalsCss`/`extractRuleBody`/`extractBalancedBlock` helpers below are
 * copied verbatim from that file per the spec instruction to reuse them
 * rather than reinvent them (they aren't exported anywhere to import).
 *
 * THIS FILE IS EXPECTED TO FAIL RED: `@keyframes zpots-seal-press`, `.zpots-
 * seal`, `.zpots-seal-pulse`, and `.zpots-pin-icon--punto svg` don't exist
 * in globals.css yet, and `.zpots-pin-icon--just-confirmed` still animates
 * `paseo-mark-draw` via `stroke-dasharray` instead of `zpots-seal-press`.
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
 * `@keyframes` bodies nest percentage/from/to blocks inside the outer
 * braces, so the simple `[^}]*` trick above would stop at the first inner
 * `}` -- walk the braces by hand instead, same approach
 * `paseo-motion-css.test.ts` uses for the reduced-motion media block.
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

describe("sello CSS contract (globals.css)", () => {
  it("declares @keyframes zpots-seal-press with a scale(1.8) -> scale(1) body", () => {
    const css = readGlobalsCss();
    const startIndex = css.search(/@keyframes\s+zpots-seal-press\s*\{/);
    expect(startIndex, "@keyframes zpots-seal-press not found").toBeGreaterThan(-1);
    const block = extractBalancedBlock(css, startIndex);
    expect(block, "could not find a balanced block for the keyframe").not.toBeNull();
    const body = block ?? "";
    expect(body).toContain("scale(1.8)");
    expect(body).toContain("scale(1)");

    // Re-asserted alongside a new keyframe check, not standalone: this guard
    // alone is already true today.
    expect(css).not.toMatch(/--zpots-/);
  });

  it(".zpots-pin-icon--just-confirmed drives zpots-seal-press, not the old dasharray draw-on", () => {
    const css = readGlobalsCss();
    const body = extractRuleBody(css, ".zpots-pin-icon--just-confirmed");
    expect(body, ".zpots-pin-icon--just-confirmed rule not found").not.toBe("");
    expect(body).toContain("zpots-seal-press");
    expect(body).toContain("var(--ease-settle)");
    expect(body).not.toContain("stroke-dasharray");
    expect(body).not.toContain("paseo-mark-draw");
  });

  it(".zpots-seal-pulse plays paseo-ring-pulse once, forwards, starting invisible", () => {
    const css = readGlobalsCss();
    const body = extractRuleBody(css, ".zpots-seal-pulse");
    expect(body, ".zpots-seal-pulse rule not found").not.toBe("");
    expect(body).toContain("paseo-ring-pulse");
    expect(body).toContain("forwards");
    expect(body).toContain("opacity: 0");
    expect(body).toContain("transform-box: view-box");
  });

  it(".zpots-seal sets transform-box: view-box so its scale/opacity press animates around center", () => {
    const css = readGlobalsCss();
    const body = extractRuleBody(css, ".zpots-seal");
    expect(body, ".zpots-seal rule not found").not.toBe("");
    expect(body).toContain("transform-box: view-box");
  });

  it(".zpots-pin-icon--punto svg sets transform-origin: 50% 50%", () => {
    const css = readGlobalsCss();
    const body = extractRuleBody(css, ".zpots-pin-icon--punto svg");
    expect(body, ".zpots-pin-icon--punto svg rule not found").not.toBe("");
    expect(body).toContain("transform-origin: 50% 50%");
  });
});

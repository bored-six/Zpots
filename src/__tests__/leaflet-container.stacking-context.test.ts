import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Live-verification bug: `nav[aria-label="Primary"]` (AppNav.tsx) is
 * `position: fixed; z-index: 40`. On `/mapa` at phone width, `.leaflet-container`
 * spans the same y-range as the nav. `.leaflet-container` itself set no
 * `position`/`z-index`, so it opened no stacking context of its own --
 * Leaflet's internal panes (tile pane z-index 200 through popup pane
 * z-index 700, leaflet's own CSS) competed directly against the nav's
 * `z-40` in the *page's* stacking context instead of staying confined
 * inside the map. 200 beats 40, so the map painted over the nav.
 *
 * The fix: `.leaflet-container` gets `isolation: isolate`, which forces it
 * to open its own stacking context without asserting a `position` or
 * `z-index` value that would then have to be kept in sync with AppNav's.
 * Every Leaflet pane's z-index now only ever competes with the container's
 * *box* (an unpositioned, normal-flow descendant of `<main>`) against the
 * nav's `z-40` box, and the nav wins regardless of what number any pane
 * inside the map uses.
 *
 * jsdom has no real layout/paint engine, so it cannot confirm that the nav
 * visually renders above the map -- that step is browser-only (see the
 * coder's report). What this file can and does check: the source rule
 * actually carries a stacking-context-establishing declaration (not just a
 * comment saying it should), and that a real `getComputedStyle` resolves
 * that declaration once the extracted rule is applied to a `.leaflet-container`
 * element, the same computed-style level of confidence
 * `tile-tint-scoping.test.tsx` uses for the neighboring rule in this file.
 */

const GLOBALS_CSS_PATH = path.join(process.cwd(), "src/app/globals.css");

function readGlobalsCss(): string {
  return fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");
}

/**
 * Pulls the whole `<selector> { <body> }` rule for the bare `.leaflet-container`
 * selector. Deliberately a plain substring search rather than
 * `tile-tint-scoping.test.tsx`'s `^[^{}]*\{` line regex: that regex's
 * `[^{}]*` happily spans the multi-line comment directly above a rule (no
 * braces in prose to stop it), so its "selector" capture actually includes
 * the whole preceding comment too -- harmless for that file's assertions
 * (the substrings it checks for happen to appear in the comment prose as
 * well as the real selector) but not something worth relying on here.
 * `.leaflet-container {` is a literal, unique string in globals.css (this
 * rule and only this rule opens with it), so a direct `indexOf` gets the
 * real rule boundaries without the comment riding along.
 */
function extractContainerRule(css: string): { ruleText: string } {
  const selectorText = ".leaflet-container {";
  const startIndex = css.indexOf(selectorText);
  if (startIndex === -1) throw new Error("no `.leaflet-container {` rule found in globals.css");

  const closeIndex = css.indexOf("}", startIndex);
  const ruleText = css.slice(startIndex, closeIndex + 1);
  return { ruleText };
}

describe(".leaflet-container establishes its own stacking context", () => {
  it("the rule declares isolation: isolate", () => {
    const { ruleText } = extractContainerRule(readGlobalsCss());

    expect(ruleText).toMatch(/isolation\s*:\s*isolate/);
  });

  it("computed style: a .leaflet-container element resolves isolation to isolate", () => {
    const { ruleText } = extractContainerRule(readGlobalsCss());

    const style = document.createElement("style");
    style.textContent = ruleText;
    document.head.appendChild(style);

    const container = document.createElement("div");
    container.className = "leaflet-container";
    document.body.appendChild(container);

    const computed = getComputedStyle(container);
    expect(computed.isolation).toBe("isolate");

    document.body.removeChild(container);
    document.head.removeChild(style);
  });

  it("the rule does not rely on a stray z-index alone (isolation is the mechanism, not a number to keep in sync with AppNav's z-40)", () => {
    const { ruleText } = extractContainerRule(readGlobalsCss());

    // Guards against a future edit swapping `isolation: isolate` for a bare
    // `z-index` without `position` -- z-index alone on a `position: static`
    // element (the default; nothing here sets position) does not create a
    // stacking context and would silently reintroduce the bug.
    expect(ruleText).not.toMatch(/z-index/);
  });
});

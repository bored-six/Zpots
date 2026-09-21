/**
 * Resolves the three "Ciudad Latina" font stacks (Cinzel, Alegreya, Alegreya
 * Sans -- layout.tsx's next/font variables) to literal font-family strings
 * canvas can use, and builds the `document.fonts.load(...)` specifiers
 * `BasemapLayer` awaits before the vector layer's first paint.
 *
 * Why this exists (the webfont race, see .claude/prds/pergamino-map.md):
 * canvas text never waits for a webfont on its own -- if Cinzel hasn't
 * loaded when a tile's labels are laid out, that tile measures/draws in
 * whatever fallback font was active at that instant and never repaints in
 * the real one. `document.fonts.load(spec)` returns a promise that
 * resolves once the matching @font-face is actually loaded (or resolves
 * immediately if it already is); `buildFontLoadTasks`'s promises are
 * passed to protomaps-leaflet as its `tasks` option, which the library
 * awaits before every tile's label layout, not just the first one
 * (`leaflet.ts`: `await Promise.all(this.tasks.map(reflect))` runs ahead
 * of `this.labelers.add(...)` on every `renderTile` call) -- so a tile
 * painted before the font finished loading simply waits, instead of
 * locking in a fallback face forever.
 */

export interface PergaminoFontStack {
  /** Cinzel 600 -- settlement, district, and POI names. */
  wordmark: string;
  /** Alegreya Sans -- street names. */
  body: string;
  /** Alegreya, used italic -- water names. */
  display: string;
}

/**
 * The generic fallback each stack resolves to when the real webfont
 * variable can't be read (jsdom, or CSS not yet loaded) -- the same
 * terminal fallback `@theme inline` itself declares
 * (`var(--font-cinzel), serif`, etc., globals.css), so a canvas label
 * drawn before/without the real font still renders in a legible face
 * instead of an empty string breaking `ctx.font`.
 */
export const PERGAMINO_FONT_FALLBACK: PergaminoFontStack = {
  wordmark: "serif",
  body: "sans-serif",
  display: "serif",
};

/** A resolved value still containing an unresolved `var(...)` token isn't usable by canvas. */
function isResolvedFontFamily(value: string): boolean {
  return value.trim().length > 0 && !value.includes("var(");
}

/**
 * Resolves `--font-wordmark`/`--font-display`/`--font-body` (globals.css's
 * `@theme inline` block) to the literal font-family stack the browser
 * would actually use, via a detached-then-attached probe element --
 * mirrors `readPergaminoPalette`'s getComputedStyle resolution, but a
 * plain `getPropertyValue` isn't enough here because these three custom
 * properties are themselves `var(--font-cinzel), serif`-shaped (nested),
 * so only a real `font-family` computed value (not a custom-property
 * value) resolves the chain.
 *
 * jsdom does not implement CSS custom property resolution at all
 * (`getComputedStyle(...).fontFamily` echoes the literal `var(...)` string
 * back rather than resolving it -- verified directly against jsdom, not
 * assumed), so this always falls back to PERGAMINO_FONT_FALLBACK in the
 * test environment; that's the correct, tested behaviour there, not a
 * gap -- see pergamino-fonts.test.ts.
 */
export function readPergaminoFontStack(root?: HTMLElement): PergaminoFontStack {
  const container = root ?? (typeof document !== "undefined" ? document.body : undefined);
  if (!container || typeof getComputedStyle !== "function") {
    return PERGAMINO_FONT_FALLBACK;
  }

  const resolve = (cssVarName: string, fallback: string): string => {
    const probe = document.createElement("span");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    probe.style.fontFamily = `var(${cssVarName})`;
    container.appendChild(probe);
    const resolved = getComputedStyle(probe).fontFamily;
    container.removeChild(probe);
    return isResolvedFontFamily(resolved) ? resolved : fallback;
  };

  return {
    wordmark: resolve("--font-wordmark", PERGAMINO_FONT_FALLBACK.wordmark),
    body: resolve("--font-body", PERGAMINO_FONT_FALLBACK.body),
    display: resolve("--font-display", PERGAMINO_FONT_FALLBACK.display),
  };
}

/**
 * The exact three font-face descriptors buildLabelRules' symbolizers use
 * (one per face actually drawn on the map -- Cinzel 600, Alegreya Sans
 * 500, Alegreya italic 500), as `document.fonts.load` specifiers. Kept as
 * a named function (not inlined in buildFontLoadTasks) so a test can
 * assert these strings line up with what the label rules actually set as
 * `font`, catching a rule changed to a weight/style nothing awaits.
 */
export function pergaminoFontLoadSpecs(fonts: PergaminoFontStack): string[] {
  return [
    `600 16px ${fonts.wordmark}`,
    `500 16px ${fonts.body}`,
    `italic 500 16px ${fonts.display}`,
  ];
}

/**
 * `document.fonts.load(...)` promises for every face buildLabelRules
 * draws with, ready to hand to protomaps-leaflet's `tasks` option.
 * Guarded for jsdom (no `document.fonts` at all -- verified directly,
 * not assumed) and any environment where the CSS Font Loading API is
 * missing, so this never throws during SSR or in tests.
 */
export function buildFontLoadTasks(fonts: PergaminoFontStack): Promise<unknown>[] {
  if (typeof document === "undefined" || !document.fonts?.load) return [];
  return pergaminoFontLoadSpecs(fonts).map((spec) => document.fonts.load(spec));
}

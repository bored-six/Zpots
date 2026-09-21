/**
 * "Pergamino" ground token names and a byte-identical fallback hex map,
 * pinned to the `@theme` block in src/app/globals.css by
 * src/__tests__/pergamino-tokens.test.ts so the two cannot drift.
 *
 * Canvas `fillStyle`/`strokeStyle` (protomaps-leaflet's paint rules)
 * cannot read a CSS custom property -- only `getComputedStyle` can
 * resolve one, and only once painted DOM exists. `readPergaminoPalette`
 * does that resolution at runtime; `PERGAMINO_FALLBACK_HEX` is what it
 * falls back to, per token, when a value comes back empty (jsdom, or
 * before first paint). This file is the only place a Pergamino ground hex
 * is written in TypeScript -- see .claude/prds/pergamino-map.md.
 */

export const PERGAMINO_TOKEN_NAMES = [
  "--color-pergamino-land",
  "--color-pergamino-sea",
  "--color-pergamino-coast",
  "--color-pergamino-major",
  "--color-pergamino-arterial",
  "--color-pergamino-street",
  "--color-pergamino-minor",
  "--color-pergamino-river",
  // Step 2: landuse groups, buildings, boundaries.
  "--color-pergamino-green",
  "--color-pergamino-civic",
  "--color-pergamino-works",
  "--color-pergamino-cemetery",
  "--color-pergamino-aeroway",
  "--color-pergamino-building",
  "--color-pergamino-building-edge",
  "--color-pergamino-boundary",
] as const;

export type PergaminoTokenName = (typeof PERGAMINO_TOKEN_NAMES)[number];

/** Byte-identical to the @theme block in globals.css; pergamino-tokens.test.ts proves it. */
export const PERGAMINO_FALLBACK_HEX: Record<PergaminoTokenName, string> = {
  "--color-pergamino-land": "#e9debf",
  "--color-pergamino-sea": "#d6be92",
  "--color-pergamino-coast": "#8a7048",
  "--color-pergamino-major": "#9d7b46",
  "--color-pergamino-arterial": "#b5945f",
  "--color-pergamino-street": "#c5a87d",
  "--color-pergamino-minor": "#d5c09a",
  "--color-pergamino-river": "#a9b79e",
  "--color-pergamino-green": "#cbd0a8",
  "--color-pergamino-civic": "#e2d3c4",
  "--color-pergamino-works": "#dfd1ac",
  "--color-pergamino-cemetery": "#ccc9ac",
  "--color-pergamino-aeroway": "#e4d9c0",
  "--color-pergamino-building": "#dccaa3",
  "--color-pergamino-building-edge": "#bfa574",
  "--color-pergamino-boundary": "#a58d64",
};

/**
 * Reads the live computed value of each Pergamino token off `root` (or
 * `document.documentElement` when omitted), falling back per-token to
 * PERGAMINO_FALLBACK_HEX when the computed value comes back empty -- no
 * CSS loaded (jsdom), or the token isn't declared for some other reason.
 */
export function readPergaminoPalette(
  root?: HTMLElement,
): Record<PergaminoTokenName, string> {
  const element =
    root ?? (typeof document !== "undefined" ? document.documentElement : undefined);
  const styles = element ? getComputedStyle(element) : undefined;

  const result = {} as Record<PergaminoTokenName, string>;
  for (const name of PERGAMINO_TOKEN_NAMES) {
    const value = styles?.getPropertyValue(name).trim();
    result[name] = value ? value : PERGAMINO_FALLBACK_HEX[name];
  }
  return result;
}

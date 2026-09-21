import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PERGAMINO_FONT_FALLBACK,
  buildFontLoadTasks,
  pergaminoFontLoadSpecs,
  readPergaminoFontStack,
} from "@/lib/pergamino-fonts";

/**
 * The webfont race (.claude/prds/pergamino-map.md): canvas text does not
 * wait for a webfont, so BasemapLayer must resolve the real font-family
 * stacks and force-load them before protomaps-leaflet lays out any label.
 * jsdom does not implement CSS custom-property resolution at all --
 * confirmed directly against jsdom (`node -e`) before writing these tests,
 * not assumed -- so readPergaminoFontStack's fallback path is the one
 * exercised here; it's still meaningful because it's the same fallback a
 * real browser would use for an unresolved `var(...)` chain.
 */

describe("readPergaminoFontStack", () => {
  it("falls back to the generic stack in jsdom -- var() is never resolved there", () => {
    expect(readPergaminoFontStack()).toEqual(PERGAMINO_FONT_FALLBACK);
  });

  it("accepts an explicit root and still falls back the same way", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    expect(readPergaminoFontStack(root)).toEqual(PERGAMINO_FONT_FALLBACK);
    document.body.removeChild(root);
  });

  it("never leaves a stray probe element in the DOM", () => {
    const before = document.body.childElementCount;
    readPergaminoFontStack();
    expect(document.body.childElementCount).toBe(before);
  });

  it("returns a plain object, not a reference to PERGAMINO_FONT_FALLBACK itself", () => {
    const stack = readPergaminoFontStack();
    expect(stack).not.toBe(PERGAMINO_FONT_FALLBACK);
    expect(stack).toEqual(PERGAMINO_FONT_FALLBACK);
  });
});

describe("pergaminoFontLoadSpecs", () => {
  it("returns exactly three specs -- one per face buildLabelRules draws with", () => {
    const specs = pergaminoFontLoadSpecs(PERGAMINO_FONT_FALLBACK);
    expect(specs).toHaveLength(3);
  });

  it("each spec names the right weight/style and the resolved family", () => {
    const fonts = { wordmark: "MyCinzel", body: "MyAlegreyaSans", display: "MyAlegreya" };
    const specs = pergaminoFontLoadSpecs(fonts);

    expect(specs).toContain("600 16px MyCinzel");
    expect(specs).toContain("500 16px MyAlegreyaSans");
    expect(specs).toContain("italic 500 16px MyAlegreya");
  });
});

describe("buildFontLoadTasks", () => {
  const originalFonts = document.fonts;

  afterEach(() => {
    Object.defineProperty(document, "fonts", { value: originalFonts, configurable: true });
  });

  it("returns [] when document.fonts is unavailable (jsdom has no CSS Font Loading API)", () => {
    Object.defineProperty(document, "fonts", { value: undefined, configurable: true });
    expect(buildFontLoadTasks(PERGAMINO_FONT_FALLBACK)).toEqual([]);
  });

  it("calls document.fonts.load once per spec and returns its promises", async () => {
    const load = vi.fn().mockResolvedValue([]);
    Object.defineProperty(document, "fonts", { value: { load }, configurable: true });

    const tasks = buildFontLoadTasks(PERGAMINO_FONT_FALLBACK);

    expect(load).toHaveBeenCalledTimes(3);
    expect(tasks).toHaveLength(3);
    for (const spec of pergaminoFontLoadSpecs(PERGAMINO_FONT_FALLBACK)) {
      expect(load).toHaveBeenCalledWith(spec);
    }
    await Promise.all(tasks);
  });
});

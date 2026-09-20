// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Reads layout.tsx as text rather than importing/rendering it -- RootLayout
 * renders an <html>/<body> shell that RTL/jsdom can't mount directly, and
 * the thing under test here (which next/font/google imports are present)
 * is a static, source-level fact anyway.
 */
function readLayoutSource(): string {
  return fs.readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf-8");
}

describe("layout.tsx font imports", () => {
  it("imports Alegreya, Alegreya_Sans, and Cinzel from next/font/google", () => {
    const source = readLayoutSource();
    const importLine = source.match(/import\s*\{[^}]*\}\s*from\s*["']next\/font\/google["']/);
    expect(importLine).not.toBeNull();
    const importedNames = importLine ? importLine[0] : "";

    expect(importedNames).toMatch(/\bAlegreya\b/);
    expect(importedNames).toMatch(/\bAlegreya_Sans\b/);
    expect(importedNames).toMatch(/\bCinzel\b/);
  });

  it("no longer imports Geist, Geist_Mono, Cormorant_Garamond, or Work_Sans", () => {
    const source = readLayoutSource();
    expect(source).not.toMatch(/\bGeist\b/);
    expect(source).not.toMatch(/\bGeist_Mono\b/);
    expect(source).not.toMatch(/\bCormorant_Garamond\b/);
    expect(source).not.toMatch(/\bWork_Sans\b/);
  });

  it("uses display: 'swap' for its font loaders", () => {
    const source = readLayoutSource();
    expect(source).toMatch(/display\s*:\s*["']swap["']/);
  });
});

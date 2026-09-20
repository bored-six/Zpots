// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Walks src/components/**\/*.tsx and src/app/**\/*.tsx by hand (no glob
 * dependency needed) looking for raw hex color literals. Everything
 * post-redesign should go through the CSS custom-property tokens in
 * globals.css (bg-cream, text-ink, var(--color-*), etc.) instead of
 * hardcoding a color inline. src/components/icons/** is exempt -- hand-
 * drawn SVG icons are allowed to hardcode things like the cream halo
 * stroke, per the spec.
 */
const ROOTS = ["src/components", "src/app"];
const EXCLUDED_DIR = path.join("src", "components", "icons");
const HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/g;

interface Offense {
  file: string;
  line: number;
  match: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && full.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

function findOffenses(): Offense[] {
  const cwd = process.cwd();
  const offenses: Offense[] = [];

  for (const root of ROOTS) {
    const rootAbs = path.join(cwd, root);
    if (!fs.existsSync(rootAbs)) continue;

    for (const fileAbs of walk(rootAbs)) {
      const relative = path.relative(cwd, fileAbs);
      if (relative.startsWith(EXCLUDED_DIR)) continue;

      const contents = fs.readFileSync(fileAbs, "utf-8");
      const lines = contents.split("\n");
      lines.forEach((lineText, index) => {
        const matches = lineText.match(HEX_PATTERN);
        if (matches) {
          for (const match of matches) {
            offenses.push({ file: relative, line: index + 1, match });
          }
        }
      });
    }
  }

  return offenses;
}

describe("no raw hex colors outside src/components/icons/**", () => {
  it("finds zero raw hex literals in src/components/**/*.tsx or src/app/**/*.tsx (icons excluded)", () => {
    const offenses = findOffenses();

    if (offenses.length > 0) {
      const listing = offenses
        .map((o) => `  ${o.file}:${o.line} -> ${o.match}`)
        .join("\n");
      throw new Error(
        `Found ${offenses.length} raw hex color(s) outside src/components/icons/**. ` +
          `Use the design tokens in globals.css instead:\n${listing}`,
      );
    }

    expect(offenses).toEqual([]);
  });
});

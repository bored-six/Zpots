// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isSpotCategory, SPOT_CATEGORIES } from "@/lib/spots";
import { PIN_GLYPH_PATHS, PinGlyph } from "@/components/icons/pin-icons";

/**
 * grabado-pins spec, section 10.2 -- geometry rules R1-R10 from section 1.1,
 * checked against the exact path strings in section 3.
 *
 * THIS FILE IS EXPECTED TO FAIL RED: `PIN_GLYPH_PATHS`/`PinGlyph` do not
 * exist in pin-icons.tsx yet, and `SPOT_CATEGORIES`/`isSpotCategory` do not
 * exist in spots.ts yet. Do not stub either to make the import resolve --
 * implement the real modules instead.
 */

interface Point {
  x: number;
  y: number;
}

const CATEGORY_ORDER = ["come", "senta", "camina", "agua", "mira", "compra"] as const;

/**
 * Minimal absolute-only SVG path "d" reader: walks M/L/H/V/A/Z commands,
 * tracking current position so H/V endpoints become full (x, y) points, and
 * flags any relative command (lowercase, except z) or curve command
 * (C/Q/S/T) as disallowed -- R3 permits straight segments and circular arcs
 * only.
 */
function parsePathD(d: string): { points: Point[]; hasDisallowedCommand: boolean } {
  const commandRe = /([MLHVACZmlhvacz])([^MLHVACZmlhvacz]*)/g;
  const numberRe = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
  let cur: Point = { x: 0, y: 0 };
  const points: Point[] = [];
  let hasDisallowedCommand = false;
  let match: RegExpExecArray | null;

  while ((match = commandRe.exec(d))) {
    const cmd = match[1];
    const nums = (match[2].match(numberRe) ?? []).map(Number);

    if (cmd !== cmd.toUpperCase() && cmd !== "z") {
      // Any lowercase command other than z is a relative command.
      hasDisallowedCommand = true;
    }
    const upper = cmd.toUpperCase();
    if (upper === "C" || upper === "Q" || upper === "S" || upper === "T") {
      hasDisallowedCommand = true;
    }

    switch (upper) {
      case "M":
      case "L":
        for (let i = 0; i + 1 < nums.length; i += 2) {
          cur = { x: nums[i], y: nums[i + 1] };
          points.push(cur);
        }
        break;
      case "H":
        for (const x of nums) {
          cur = { x, y: cur.y };
          points.push(cur);
        }
        break;
      case "V":
        for (const y of nums) {
          cur = { x: cur.x, y };
          points.push(cur);
        }
        break;
      case "A":
        // rx ry x-axis-rotation large-arc-flag sweep-flag x y, repeating groups of 7.
        for (let i = 0; i + 6 < nums.length; i += 7) {
          cur = { x: nums[i + 5], y: nums[i + 6] };
          points.push(cur);
        }
        break;
      case "Z":
        break;
      default:
        hasDisallowedCommand = true;
    }
  }

  return { points, hasDisallowedCommand };
}

describe("SPOT_CATEGORIES / isSpotCategory", () => {
  it("lists exactly the six ids in the spec's order", () => {
    expect(SPOT_CATEGORIES).toEqual(CATEGORY_ORDER);
  });

  it("rejects an id outside the set", () => {
    expect(isSpotCategory("noche")).toBe(false);
  });
});

describe.each(CATEGORY_ORDER)("PIN_GLYPH_PATHS.%s", (id) => {
  it("mass and cuts use only absolute M/L/H/V/A/Z commands (R3)", () => {
    const { mass, cuts } = PIN_GLYPH_PATHS[id];
    expect(parsePathD(mass).hasDisallowedCommand).toBe(false);
    expect(parsePathD(cuts).hasDisallowedCommand).toBe(false);
  });

  it("every mass and cuts point sits inside the r=7.2 safe circle (R5)", () => {
    const { mass, cuts } = PIN_GLYPH_PATHS[id];
    const points = [...parsePathD(mass).points, ...parsePathD(cuts).points];
    expect(points.length).toBeGreaterThan(0);
    for (const { x, y } of points) {
      expect((x - 16) ** 2 + (y - 16) ** 2).toBeLessThanOrEqual(51.84);
    }
  });

  it("mass vertices are bilaterally symmetric about x=16 (R4)", () => {
    const { mass } = PIN_GLYPH_PATHS[id];
    const points = parsePathD(mass).points;
    expect(points.length).toBeGreaterThan(0);
    for (const { x, y } of points) {
      const mirrorX = 32 - x;
      const hasMirror = points.some(
        (p) => Math.abs(p.x - mirrorX) <= 0.01 && Math.abs(p.y - y) <= 0.01,
      );
      expect(hasMirror).toBe(true);
    }
  });

  it("mass has no rx and no stroke attribute (R3, R8)", () => {
    const { mass } = PIN_GLYPH_PATHS[id];
    expect(mass).not.toMatch(/\brx\b/);
    expect(mass).not.toMatch(/\bstroke\b/);
  });

  it(`PinGlyph renders exactly two <path> children on <g data-glyph="${id}"> with no other attributes`, () => {
    const html = renderToStaticMarkup(createElement(PinGlyph, { category: id }));
    expect(html).toMatch(new RegExp(`^<g data-glyph="${id}">`));

    const pathTags = [...html.matchAll(/<path[^>]*>/g)].map((m) => m[0]);
    expect(pathTags).toHaveLength(2);
    expect(pathTags[0]).toContain('fill="#2a2017"');
    expect(pathTags[1]).toContain('fill="#f6eedc"');
  });
});

describe("glyph distinctness", () => {
  it("all six mass path strings are pairwise different", () => {
    const masses = CATEGORY_ORDER.map((id) => PIN_GLYPH_PATHS[id].mass);
    expect(new Set(masses).size).toBe(masses.length);
  });
});

import { describe, expect, it } from "vitest";
import { createPinIcon } from "@/lib/pin-icon";

/**
 * grabado-pins spec, section 14.10 (new for revision 2) -- the punto
 * azulejo (section 14.5): the tier-3 (10px) mark is a lozenge, not a dot,
 * and no pin anywhere renders a photo.
 *
 * THIS FILE IS EXPECTED TO FAIL RED against the revision-1 implementation:
 * the punto is still two `<circle>` elements, not two `<path>` diamonds,
 * and `pin-icon.ts` still exports `createPhotoPinIcon`.
 */

interface ParsedVertex {
  x: number;
  y: number;
}

function parsePath(d: string): ParsedVertex[] {
  // Every punto path is "M x,y L x,y L x,y L x,y Z" -- four vertices.
  const numbers = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  const vertices: ParsedVertex[] = [];
  for (let i = 0; i < numbers.length; i += 2) {
    vertices.push({ x: numbers[i], y: numbers[i + 1] });
  }
  return vertices;
}

describe("createPinIcon -- punto azulejo (size 10)", () => {
  it.each(["unconfirmed", "confirmed"] as const)(
    "%s: exactly two <path>, zero <circle>, and the halo path matches the spec",
    (status) => {
      const html = String(createPinIcon(status, { size: 10 }).options.html);
      const pathMatches = html.match(/<path/g) ?? [];
      const circleMatches = html.match(/<circle/g) ?? [];
      expect(pathMatches).toHaveLength(2);
      expect(circleMatches).toHaveLength(0);
      expect(html).toContain('d="M16,1 L31,16 L16,31 L1,16 Z"');
      expect(html).toContain('fill="#f6eedc"');
      expect(html).toContain('d="M16,4 L28,16 L16,28 L4,16 Z"');
    },
  );

  it("confirmed body is solid teal with no stroke", () => {
    const html = String(createPinIcon("confirmed", { size: 10 }).options.html);
    const bodyPath = html.match(/<path[^>]*d="M16,4 L28,16 L16,28 L4,16 Z"[^>]*>/)?.[0] ?? "";
    expect(bodyPath).toContain('fill="#1f6f78"');
    expect(bodyPath).not.toContain("stroke");
  });

  it("unconfirmed body is cream at 0.85 opacity with a stone-deep stroke", () => {
    const html = String(createPinIcon("unconfirmed", { size: 10 }).options.html);
    const bodyPath = html.match(/<path[^>]*d="M16,4 L28,16 L16,28 L4,16 Z"[^>]*>/)?.[0] ?? "";
    expect(bodyPath).toContain('fill="#f6eedc"');
    expect(bodyPath).toContain('fill-opacity="0.85"');
    expect(bodyPath).toContain('stroke="#7a6448"');
    expect(bodyPath).toContain('stroke-width="3"');
  });

  it.each(["M16,1 L31,16 L16,31 L1,16 Z", "M16,4 L28,16 L16,28 L4,16 Z"])(
    "%s: four vertices, mirrored across x=16 and y=16, tips on the axes",
    (d) => {
      const vertices = parsePath(d);
      expect(vertices).toHaveLength(4);

      for (const vertex of vertices) {
        const hasXMirror = vertices.some(
          (other) => Math.abs(other.x - (32 - vertex.x)) < 0.01 && other.y === vertex.y,
        );
        const hasYMirror = vertices.some(
          (other) => other.x === vertex.x && Math.abs(other.y - (32 - vertex.y)) < 0.01,
        );
        expect(hasXMirror).toBe(true);
        expect(hasYMirror).toBe(true);
        expect(vertex.x === 16 || vertex.y === 16).toBe(true);
      }
    },
  );

  it("category and justConfirmed are no-ops on a punto -- byte-identical html to the bare call", () => {
    const bareHtml = String(createPinIcon("confirmed", { size: 10 }).options.html);
    const decoratedHtml = String(
      createPinIcon("confirmed", { size: 10, category: "mira", justConfirmed: true }).options.html,
    );
    expect(decoratedHtml).toBe(bareHtml);
  });

  it("pin-icon.ts exports exactly createPinIcon at runtime", async () => {
    const pinIcon = await import("@/lib/pin-icon");
    expect(Object.keys(pinIcon).sort()).toEqual(["createPinIcon"]);
  });

  it("no createPinIcon output ever contains an <img>, for any size, status, or category", () => {
    const sizes = [32, 22, 16, 10] as const;
    const statuses = ["unconfirmed", "confirmed"] as const;
    const categories = [undefined, "come", "senta", "camina", "agua", "mira", "compra"] as const;

    for (const size of sizes) {
      for (const status of statuses) {
        for (const category of categories) {
          const html = String(createPinIcon(status, { size, category }).options.html);
          expect(html).not.toContain("<img");
        }
      }
    }
  });
});

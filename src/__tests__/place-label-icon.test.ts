import { describe, expect, it } from "vitest";

import { createPlaceLabelIcon } from "@/lib/place-label-icon";
import type { PlaceLabel } from "@/lib/places";

function place(overrides: Partial<PlaceLabel> = {}): PlaceLabel {
  return {
    id: "test-place",
    name: "Fort Pilar",
    kind: "landmark",
    lat: 6.9028,
    lng: 122.0817,
    minZoom: 13,
    ...overrides,
  };
}

describe("createPlaceLabelIcon", () => {
  it("className carries both zpots-place-label and the kind modifier", () => {
    const icon = createPlaceLabelIcon(place({ kind: "barangay" }));
    const className = String(icon.options.className ?? "");
    expect(className).toMatch(/\bzpots-place-label\b/);
    expect(className).toMatch(/\bzpots-place-label--barangay\b/);
  });

  it("html contains the place name verbatim, not uppercased -- CSS does the transform", () => {
    const icon = createPlaceLabelIcon(place({ name: "Santa María" }));
    const html = String(icon.options.html);
    expect(html).toContain("Santa María");
    expect(html).not.toContain("SANTA MARÍA");
  });

  it('html carries aria-hidden="true" so the label never reaches the accessible tree', () => {
    const icon = createPlaceLabelIcon(place());
    expect(String(icon.options.html)).toContain('aria-hidden="true"');
  });

  it("iconAnchor is [0,-15] for a landmark and [0,0] for barangay/water; iconSize is always [0,0]", () => {
    const landmark = createPlaceLabelIcon(place({ kind: "landmark" }));
    const barangay = createPlaceLabelIcon(place({ kind: "barangay" }));
    const water = createPlaceLabelIcon(place({ kind: "water" }));

    expect(landmark.options.iconAnchor).toEqual([0, -15]);
    expect(barangay.options.iconAnchor).toEqual([0, 0]);
    expect(water.options.iconAnchor).toEqual([0, 0]);

    expect(landmark.options.iconSize).toEqual([0, 0]);
    expect(barangay.options.iconSize).toEqual([0, 0]);
    expect(water.options.iconSize).toEqual([0, 0]);
  });

  it("html contains no raw hex literal -- colour comes from the class, not inline", () => {
    const icon = createPlaceLabelIcon(place());
    expect(String(icon.options.html)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("escapes <, & and a quote in the name instead of injecting them raw", () => {
    const icon = createPlaceLabelIcon(place({ name: `A & B <script> "x"` }));
    const html = String(icon.options.html);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('"x"');
    expect(html).toContain("&amp;");
    expect(html).toContain("&lt;");
  });
});

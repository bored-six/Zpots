// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Live-verification bug (see .claude/prds/pergamino-map.md, "Change Log"):
 * CityMask's mask Polygon covers the whole world outside the city outline
 * at every zoom, but `.zpots-city-mask` in globals.css used
 * `fill-opacity: 0.92` -- eight percent of the basemap still showed
 * through, which is enough for tile-drawn text outside the city to stay
 * legible (verified against the archive: 35 of its 256 named places fall
 * outside the outline, one already visible on screen -- "Poblacion", the
 * poblacion of Sibuco in Zamboanga del Norte, 11.8km outside the boundary).
 *
 * The fix is fully opaque: `fill-opacity: 1`. Anything short of 1 still
 * leaks -- the whole point of the mask is "nothing outside the city
 * renders", and 0.92 already proved that even a small transparency lets
 * high-contrast tile text read through. The dashed `.zpots-city-outline`
 * stroke (unchanged) is what keeps the city still reading as a drawn
 * shape rather than a crude cutout once the fill is solid.
 */
const GLOBALS_CSS_PATH = path.join(process.cwd(), "src/app/globals.css");
const CITY_MASK_PATH = path.join(process.cwd(), "src/components/CityMask.tsx");
const PLACE_LABELS_LAYER_PATH = path.join(
  process.cwd(),
  "src/components/PlaceLabelsLayer.tsx",
);

function readGlobalsCss(): string {
  return fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");
}

function extractRuleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ruleMatch = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!ruleMatch) throw new Error(`no \`${selector} { ... }\` rule found in globals.css`);
  return ruleMatch[1];
}

describe(".zpots-city-mask -- fully opaque, nothing outside the city renders", () => {
  it("fill-opacity is 1, not a fractional leak value", () => {
    const body = extractRuleBody(readGlobalsCss(), ".zpots-city-mask");
    expect(body).toMatch(/fill-opacity\s*:\s*1\b/);
    // Guards specifically against the old leak value coming back, and any
    // other fractional value standing in for it.
    expect(body).not.toMatch(/fill-opacity\s*:\s*0\.\d+/);
  });

  it("still fills with the cream token and carries no stroke of its own (the outline shape owns the stroke)", () => {
    const body = extractRuleBody(readGlobalsCss(), ".zpots-city-mask");
    expect(body).toMatch(/fill\s*:\s*var\(--color-cream\)/);
    expect(body).toMatch(/stroke\s*:\s*none/);
  });

  it(".zpots-city-outline keeps its dashed stroke so the city still reads as a drawn shape once the mask is solid", () => {
    const body = extractRuleBody(readGlobalsCss(), ".zpots-city-outline");
    expect(body).toMatch(/stroke-dasharray\s*:\s*\S/);
    expect(body).toMatch(/fill\s*:\s*none/);
  });
});

describe("cityMask pane sits above the tile pane AND above the placeLabels pane (label-tuning defect 3)", () => {
  it("CityMask.tsx's cityMask pane is z-index 350", () => {
    const source = fs.readFileSync(CITY_MASK_PATH, "utf-8");
    const match = source.match(/pane\.style\.zIndex\s*=\s*["'](\d+)["']/);
    expect(match, "no pane.style.zIndex assignment found in CityMask.tsx").not.toBeNull();
    expect(Number(match?.[1])).toBe(350);
  });

  it("PlaceLabelsLayer.tsx's placeLabels pane is a lower z-index than CityMask's cityMask pane", () => {
    const cityMaskSource = fs.readFileSync(CITY_MASK_PATH, "utf-8");
    const placeLabelsSource = fs.readFileSync(PLACE_LABELS_LAYER_PATH, "utf-8");
    const cityMaskZ = Number(
      cityMaskSource.match(/pane\.style\.zIndex\s*=\s*["'](\d+)["']/)?.[1],
    );
    const placeLabelsZ = Number(
      placeLabelsSource.match(/pane\.style\.zIndex\s*=\s*["'](\d+)["']/)?.[1],
    );
    // Reversed from the original design (label-tuning defect 3): placeLabels
    // used to sit at 450, *above* the mask (350), so "Mar de Basilán" and
    // "Bahía de Zamboanga" painted over masked-out territory outside the
    // city whenever their anchor point fell there, while every canvas
    // label underneath was correctly hidden. Leaflet's own tile pane
    // defaults to z-index 200 (not something this codebase sets) --
    // placeLabels now sits between that and the mask, so it still draws
    // over the ground/roads but is masked exactly like every canvas label
    // once the mask (350) is composited on top.
    expect(placeLabelsZ).toBeGreaterThan(200);
    expect(placeLabelsZ).toBeLessThan(cityMaskZ);
  });
});

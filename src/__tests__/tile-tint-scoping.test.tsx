import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Live-verification bug: `protomaps-leaflet` subclasses `L.GridLayer`, so
 * the vector "Pergamino" ground it draws lands in the same
 * `.leaflet-tile-pane` the raster fallback's `TileLayer` uses. The sepia
 * tint in globals.css was written unscoped, on the assumption that only
 * the raster fallback ever paints into that pane -- so it was silently
 * washing out the vector palette's own deliberately-chosen colours too.
 *
 * The fix scopes the tint to `BasemapLayer`'s raster mode only, via a
 * `data-basemap` attribute it sets on `map.getContainer()` (the
 * `.leaflet-container` ancestor of every Leaflet pane). This file proves
 * both halves: the CSS rule is actually scoped (source-level), and a
 * realistic DOM tree confirms the vector ground is untouched while the
 * raster ground still gets the tint (computed-style level, via jsdom's
 * CSSOM -- jsdom does resolve attribute-selector-scoped `filter` through
 * `getComputedStyle`, confirmed against the real extracted rule below).
 */

const GLOBALS_CSS_PATH = path.join(process.cwd(), "src/app/globals.css");

function readGlobalsCss(): string {
  return fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");
}

/**
 * Pulls the whole `<selector> { <body> }` rule containing `.leaflet-tile-pane`,
 * the same selector-line extraction the cascade adversarial test uses
 * (`^[^{}]*\{` per line) so a preceding comment block never gets swept into
 * the "selector".
 */
function extractTileRule(css: string): { selector: string; ruleText: string } {
  const selectorLines = css.match(/^[^{}]*\{/gm) ?? [];
  const line = selectorLines.find((candidate) => candidate.includes(".leaflet-tile-pane"));
  if (!line) throw new Error("no rule targeting .leaflet-tile-pane found in globals.css");

  const selector = line.slice(0, line.indexOf("{")).trim();
  const startIndex = css.indexOf(line);
  const closeIndex = css.indexOf("}", startIndex);
  const ruleText = css.slice(startIndex, closeIndex + 1);
  return { selector, ruleText };
}

describe("tile tint is scoped to the raster fallback only", () => {
  it("the .leaflet-tile-pane filter rule's selector requires a raster data-basemap ancestor, not the bare pane class", () => {
    const { selector } = extractTileRule(readGlobalsCss());

    // The bug: selector === ".leaflet-tile-pane" with nothing scoping it,
    // so it matched the vector canvas's tile pane too.
    expect(selector).not.toBe(".leaflet-tile-pane");
    expect(selector).toContain('[data-basemap="raster"]');
    expect(selector).toContain(".leaflet-tile-pane");
  });

  it("computed style: the vector ground's tile pane (data-basemap=\"pergamino\") is not filtered", () => {
    const { ruleText } = extractTileRule(readGlobalsCss());

    const style = document.createElement("style");
    style.textContent = ruleText;
    document.head.appendChild(style);

    const container = document.createElement("div");
    container.className = "leaflet-container";
    container.setAttribute("data-basemap", "pergamino");
    const tilePane = document.createElement("div");
    tilePane.className = "leaflet-tile-pane";
    container.appendChild(tilePane);
    document.body.appendChild(container);

    const computed = getComputedStyle(tilePane);
    expect(computed.filter === "" || computed.filter === "none").toBe(true);

    document.body.removeChild(container);
    document.head.removeChild(style);
  });

  it("computed style: the raster fallback's tile pane (data-basemap=\"raster\") is still tinted", () => {
    const { ruleText } = extractTileRule(readGlobalsCss());

    const style = document.createElement("style");
    style.textContent = ruleText;
    document.head.appendChild(style);

    const container = document.createElement("div");
    container.className = "leaflet-container";
    container.setAttribute("data-basemap", "raster");
    const tilePane = document.createElement("div");
    tilePane.className = "leaflet-tile-pane";
    container.appendChild(tilePane);
    document.body.appendChild(container);

    const computed = getComputedStyle(tilePane);
    expect(computed.filter).not.toBe("");
    expect(computed.filter).not.toBe("none");
    expect(computed.filter).toContain("sepia");

    document.body.removeChild(container);
    document.head.removeChild(style);
  });

  it("a tile pane with no data-basemap attribute at all (mode not yet resolved) is not filtered", () => {
    const { ruleText } = extractTileRule(readGlobalsCss());

    const style = document.createElement("style");
    style.textContent = ruleText;
    document.head.appendChild(style);

    const container = document.createElement("div");
    container.className = "leaflet-container";
    const tilePane = document.createElement("div");
    tilePane.className = "leaflet-tile-pane";
    container.appendChild(tilePane);
    document.body.appendChild(container);

    const computed = getComputedStyle(tilePane);
    expect(computed.filter === "" || computed.filter === "none").toBe(true);

    document.body.removeChild(container);
    document.head.removeChild(style);
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ZAMBOANGA_CITY_OUTLINE } from "@/data/zamboanga-city-outline";

// Serialize-only stand-ins: react-leaflet's real Polygon/Polyline need a
// live Leaflet map context we don't have in jsdom, so we replace them with
// divs that dump every prop they were given as JSON, and assert on that
// JSON rather than on any rendered path/svg output. `useMap` is a minimal
// fake -- just enough surface (`getPane`/`createPane`) for CityMask's own
// pane-creation effect to run without a real Leaflet map instance.
vi.mock("react-leaflet", () => {
  const panes: Record<string, { style: { zIndex: string } }> = {};
  return {
    Polygon: (props: Record<string, unknown>) => (
      <div data-testid="polygon" data-props={JSON.stringify(props)} />
    ),
    Polyline: (props: Record<string, unknown>) => (
      <div data-testid="polyline" data-props={JSON.stringify(props)} />
    ),
    useMap: () => ({
      getPane: (name: string) => panes[name],
      createPane: (name: string) => {
        const pane = { style: { zIndex: "" } };
        panes[name] = pane;
        return pane;
      },
    }),
  };
});

import CityMask, { WORLD_RING } from "@/components/CityMask";

// JSON.stringify/parse round-trip so readonly tuple types compare equal to
// the plain arrays that come back out of `dataset.props`.
const plainOutline = JSON.parse(JSON.stringify(ZAMBOANGA_CITY_OUTLINE));
const plainWorldRing = JSON.parse(JSON.stringify(WORLD_RING));

function renderShapes() {
  render(<CityMask />);
  return [
    ...screen.queryAllByTestId("polygon"),
    ...screen.queryAllByTestId("polyline"),
  ].map((el) => JSON.parse(el.getAttribute("data-props") ?? "{}"));
}

describe("CityMask", () => {
  it("exports a WORLD_RING outer ring", () => {
    expect(Array.isArray(WORLD_RING)).toBe(true);
    expect(WORLD_RING.length).toBeGreaterThanOrEqual(4);
  });

  it("renders a mask Polygon with the world ring as the outer ring and the city outline as the hole, non-interactive, on the cityMask pane", () => {
    const shapes = renderShapes();
    const mask = shapes.find((props) => props.pane === "cityMask");

    expect(mask).toBeDefined();
    expect(Array.isArray(mask.positions)).toBe(true);
    expect(mask.positions).toHaveLength(2);
    expect(mask.positions[0]).toEqual(plainWorldRing);
    expect(mask.positions[1]).toEqual(plainOutline);
    expect(mask.interactive).toBe(false);
  });

  it("renders a separate outline stroke shape (Polygon or Polyline) distinct from the mask", () => {
    const shapes = renderShapes();
    const mask = shapes.find((props) => props.pane === "cityMask");
    const stroke = shapes.find((props) => props !== mask);

    expect(shapes.length).toBeGreaterThanOrEqual(2);
    expect(stroke).toBeDefined();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SpotPhoto from "@/components/SpotPhoto";

/**
 * Paseo motion pass, Wave 2.1 (.claude/prds/paseo-motion.md) -- the popup
 * photo's `max-h-40 rounded border` styling used to leak into the
 * full-screen Paseo card, so Ken Burns drift (Wave 1's .paseo-photo/
 * .paseo-ken-burns CSS) would look broken on a 160px-tall image. `variant`
 * defaults to "popup" so every existing caller (SpotMap.tsx, u/[handle])
 * is unaffected; SpotCardView opts into "fill".
 */
describe("SpotPhoto -- variant", () => {
  it("defaults to the popup variant: bounded height, border, radius", () => {
    render(<SpotPhoto photoUrl="https://example.com/a.jpg" name="Rio Hondo" />);
    const img = screen.getByAltText("Photo of Rio Hondo");

    expect(img.className).toMatch(/\bmax-h-40\b/);
    expect(img.className).toMatch(/\bborder\b/);
    expect(img.className).toMatch(/\brounded\b/);
  });

  it("the fill variant is full-bleed: no popup height cap, no border, no radius", () => {
    render(<SpotPhoto photoUrl="https://example.com/a.jpg" name="Rio Hondo" variant="fill" />);
    const img = screen.getByAltText("Photo of Rio Hondo");

    expect(img.className).not.toMatch(/\bmax-h-40\b/);
    expect(img.className).not.toMatch(/\bborder\b/);
    expect(img.className).not.toMatch(/\brounded\b/);
    expect(img.className).toMatch(/\bh-full\b/);
    expect(img.className).toMatch(/\bw-full\b/);
    expect(img.className).toMatch(/\bobject-cover\b/);
  });

  it("the fill variant's placeholder still renders when there is no photoUrl", () => {
    render(<SpotPhoto name="Rio Hondo" variant="fill" />);

    expect(screen.getByTestId("photo-placeholder")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("the fill variant still swaps to the placeholder on an image error", () => {
    render(<SpotPhoto photoUrl="https://example.com/broken.jpg" name="Rio Hondo" variant="fill" />);
    const img = screen.getByAltText("Photo of Rio Hondo");

    fireEvent.error(img);

    expect(screen.queryByAltText("Photo of Rio Hondo")).not.toBeInTheDocument();
    expect(screen.getByTestId("photo-placeholder")).toBeInTheDocument();
  });
});

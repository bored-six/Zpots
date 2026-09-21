import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SpotCardView from "@/components/SpotCardView";
import type { SpotCard } from "@/lib/spots";

/**
 * Paseo motion pass, Wave 2.1 (.claude/prds/paseo-motion.md) -- the class
 * names and data attributes Wave 1's globals.css keys its animations off
 * of: `.paseo-photo` on the photo layer, `.paseo-veil` on the tinta
 * gradient, and `.paseo-line` + `--paseo-line-index` on the name/note/
 * distance lines. This file only asserts the hooks are attached correctly
 * -- the animations themselves are CSS, already covered by Wave 1's own
 * tests.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function makeCard(overrides: Partial<SpotCard> = {}): SpotCard {
  return {
    id: "spot-1",
    name: "Rio Hondo Boardwalk",
    note: "Great sunset view, watch your step on loose planks.",
    lat: 6.9,
    lng: 122.05,
    status: "unconfirmed",
    confirmations: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    author: { id: "user-2", handle: "kuya_ben", displayName: "Kuya Ben", avatarUrl: null },
    ...overrides,
  };
}

function baseProps(overrides: Partial<Parameters<typeof SpotCardView>[0]> = {}) {
  return {
    card: makeCard(),
    isSaved: false,
    confirmedByMe: false,
    onSave: vi.fn(),
    onUnsave: vi.fn(),
    onBeenHere: vi.fn(),
    onReport: vi.fn(),
    ...overrides,
  };
}

describe("SpotCardView -- paseo motion hooks", () => {
  it("the photo layer wrapper carries .paseo-photo and the tinta gradient carries .paseo-veil", () => {
    const { container } = render(<SpotCardView {...baseProps()} />);

    expect(container.querySelector(".paseo-photo")).toBeInTheDocument();
    expect(container.querySelector(".paseo-veil")).toBeInTheDocument();
  });

  it("the name carries .paseo-line with --paseo-line-index: 1", () => {
    render(<SpotCardView {...baseProps()} />);
    const name = screen.getByText("Rio Hondo Boardwalk");

    expect(name).toHaveClass("paseo-line");
    expect(name.style.getPropertyValue("--paseo-line-index")).toBe("1");
  });

  it("the note carries .paseo-line with --paseo-line-index: 2", () => {
    render(<SpotCardView {...baseProps()} />);
    const note = screen.getByText(/great sunset view/i);

    expect(note).toHaveClass("paseo-line");
    expect(note.style.getPropertyValue("--paseo-line-index")).toBe("2");
  });

  it("the distance carries .paseo-line with --paseo-line-index: 3", () => {
    render(<SpotCardView {...baseProps({ card: makeCard({ distanceM: 500 }) })} />);
    const distance = screen.getByText(/away/i);

    expect(distance).toHaveClass("paseo-line");
    expect(distance.style.getPropertyValue("--paseo-line-index")).toBe("3");
  });

  it("the card photo renders full-bleed (fill variant), without the popup's max-h-40 constraint", () => {
    render(
      <SpotCardView
        {...baseProps({ card: makeCard({ photoUrl: "https://example.com/a.jpg" }) })}
      />,
    );
    const img = screen.getByAltText("Photo of Rio Hondo Boardwalk");

    expect(img.className).not.toMatch(/\bmax-h-40\b/);
  });
});

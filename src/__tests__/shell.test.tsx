import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ status: "signed-out" }),
}));

import ClipboardShell from "@/components/ClipboardShell";
import { AzulejoBand } from "@/components/icons/ornaments";

describe("ClipboardShell -- plaza / stone-wall redesign", () => {
  it("renders the Zpots wordmark", () => {
    render(
      <ClipboardShell>
        <p>content</p>
      </ClipboardShell>,
    );
    expect(screen.getByText("Zpots")).toBeInTheDocument();
  });

  it("renders the 'CIUDAD DE ZAMBOANGA' section label", () => {
    render(
      <ClipboardShell>
        <p>content</p>
      </ClipboardShell>,
    );
    expect(screen.getByText(/ciudad de zamboanga/i)).toBeInTheDocument();
  });

  it("renders a .vinta-rule element", () => {
    const { container } = render(
      <ClipboardShell>
        <p>content</p>
      </ClipboardShell>,
    );
    expect(container.querySelector(".vinta-rule")).not.toBeNull();
  });

  it("does not render anything with a class or test-id containing 'binder' (the binder-clip motif is retired)", () => {
    const { container } = render(
      <ClipboardShell>
        <p>content</p>
      </ClipboardShell>,
    );
    expect(container.querySelector('[class*="binder" i]')).toBeNull();
    expect(container.querySelector('[data-testid*="binder" i]')).toBeNull();
  });
});

describe("AzulejoBand -- tileable lattice pattern", () => {
  it("two rendered bands have distinct pattern ids, so neither reuses the other's <defs>", () => {
    const { container } = render(
      <>
        <AzulejoBand />
        <AzulejoBand />
      </>,
    );

    const patterns = container.querySelectorAll("pattern");
    expect(patterns.length).toBe(2);
    const ids = Array.from(patterns).map((p) => p.id);
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("has no viewBox on the outer svg, so the pattern tiles in real pixels instead of being stretched to fit", () => {
    const { container } = render(<AzulejoBand />);

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).not.toHaveAttribute("viewBox");
    expect(svg).not.toHaveAttribute("preserveAspectRatio");
  });

  it("the <pattern> tiles in real pixels: patternUnits='userSpaceOnUse' with a 24x12 tile", () => {
    const { container } = render(<AzulejoBand />);

    const pattern = container.querySelector("pattern");
    expect(pattern).not.toBeNull();
    expect(pattern).toHaveAttribute("patternUnits", "userSpaceOnUse");
    expect(pattern).toHaveAttribute("width", "24");
    expect(pattern).toHaveAttribute("height", "12");
  });
});

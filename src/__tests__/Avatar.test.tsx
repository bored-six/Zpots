import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Avatar from "@/components/Avatar";

/**
 * `Avatar` (social-spots.md "Default avatar"): shows the real photo when
 * `avatarUrl` is set, otherwise initials on a palette background chosen
 * deterministically from the handle, identical on server and client. Per
 * the user's test-features-not-design rule, this only asserts on behavior:
 * which element renders (image vs. initials), the initials text itself, and
 * that the *same handle* always maps to the *same* palette slot -- never on
 * the actual color/hex/class used for that slot.
 */

describe("Avatar -- with a photo", () => {
  it("renders an <img> with the given avatarUrl", () => {
    render(<Avatar handle="kuya_ben" avatarUrl="https://cdn.example.com/a.jpg" />);

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://cdn.example.com/a.jpg");
  });

  it("the image's accessible name references the handle", () => {
    render(<Avatar handle="kuya_ben" avatarUrl="https://cdn.example.com/a.jpg" />);

    expect(screen.getByRole("img", { name: /kuya_ben/i })).toBeInTheDocument();
  });

  it("does not render the initials fallback text when a photo is present", () => {
    render(<Avatar handle="kuya_ben" avatarUrl="https://cdn.example.com/a.jpg" />);

    expect(screen.queryByText("KU")).not.toBeInTheDocument();
  });
});

describe("Avatar -- initials fallback (no avatarUrl)", () => {
  it("renders no <img> when avatarUrl is null", () => {
    render(<Avatar handle="kuya_ben" avatarUrl={null} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows initials derived from the handle", () => {
    render(<Avatar handle="kuya_ben" avatarUrl={null} />);

    expect(screen.getByText(/^ku$/i)).toBeInTheDocument();
  });

  it("has an accessible name referencing the handle even without a photo", () => {
    render(<Avatar handle="kuya_ben" avatarUrl={null} />);

    expect(screen.getByLabelText(/kuya_ben/i)).toBeInTheDocument();
  });

  it("picks the same palette slot for the same handle on repeated renders (deterministic)", () => {
    const { container: first } = render(<Avatar handle="kuya_ben" avatarUrl={null} />);
    const firstSlot = first.querySelector("[data-palette-index]")?.getAttribute("data-palette-index");

    const { container: second } = render(<Avatar handle="kuya_ben" avatarUrl={null} />);
    const secondSlot = second.querySelector("[data-palette-index]")?.getAttribute("data-palette-index");

    expect(firstSlot).not.toBeNull();
    expect(firstSlot).toBe(secondSlot);
  });

  it("the palette slot is one of the 5 defined palette colors (index 0-4)", () => {
    const { container } = render(<Avatar handle="some_other_handle" avatarUrl={null} />);
    const slot = Number(container.querySelector("[data-palette-index]")?.getAttribute("data-palette-index"));

    expect(slot).toBeGreaterThanOrEqual(0);
    expect(slot).toBeLessThanOrEqual(4);
  });

  it("different handles are not forced onto the same hardcoded slot (spread across the palette)", () => {
    const handles = ["ana", "bento", "chuy", "dara", "eli", "fina", "gio", "hana"];
    const slots = new Set(
      handles.map((handle) => {
        const { container } = render(<Avatar handle={handle} avatarUrl={null} />);
        return container.querySelector("[data-palette-index]")?.getAttribute("data-palette-index");
      }),
    );

    // Not every handle should collide onto one single index -- a
    // non-hashing "always slot 0" implementation would fail this.
    expect(slots.size).toBeGreaterThan(1);
  });

  it("handles a handle shorter than 2 characters without throwing", () => {
    expect(() => render(<Avatar handle="a" avatarUrl={null} />)).not.toThrow();
  });
});

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for the bottom-nav-covers-card-actions bug: at 375px
 * the deck's root wrapper (`app/page.tsx`'s `HomeContent`) was `h-dvh` --
 * a full-viewport-height child. `main`'s own `pb-16` (`app/layout.tsx`),
 * meant to reserve room for the fixed `h-16` bottom nav, has no effect on a
 * child that already demands the *entire* viewport for itself: the padding
 * just pushes the page 64px taller than the viewport instead of shrinking
 * anything on screen, so the card's action row (Save / Been here / Report,
 * `mt-auto` at the bottom of `SpotCardView`) lands directly under the nav.
 *
 * jsdom does not lay out real pixels, so this cannot measure bounding
 * rects the way a real browser reproduction does. What it *can* assert is
 * the structural contract the fix depends on: the deck's own height class
 * must reserve the nav's height on phone (where the nav is a fixed bottom
 * bar) and must NOT do so at `lg` (where `AppNav` becomes a left rail that
 * takes no vertical space). This does not prove pixels don't overlap in a
 * real browser -- only that the height rule which caused the overlap is no
 * longer "full viewport height at every breakpoint".
 */

vi.mock("@/components/SpotsDeck", () => ({
  default: () => <div data-testid="spots-deck" />,
}));

describe("Home (/) root wrapper -- clears the fixed bottom nav on phone", () => {
  it("does not use a bare, unqualified h-dvh (full viewport height at every breakpoint)", async () => {
    const Home = (await import("@/app/page")).default;
    const { container } = render(<Home />);

    const root = container.firstElementChild as HTMLElement;
    const classes = root.className.split(/\s+/);

    // A bare "h-dvh" token (no responsive prefix) would apply at every
    // breakpoint, including phone -- the exact class that caused the
    // overlap. It's fine for "lg:h-dvh" to exist (full height once the nav
    // is a rail, not a bottom bar); only the unprefixed token is banned.
    expect(classes).not.toContain("h-dvh");
  });

  it("reserves the bottom nav's height (h-16 / 4rem) in the deck's own default (phone) height", async () => {
    const Home = (await import("@/app/page")).default;
    const { container } = render(<Home />);

    const root = container.firstElementChild as HTMLElement;
    const classes = root.className.split(/\s+/);

    // The default (no breakpoint prefix) height class must itself subtract
    // the nav's height -- not rely on ancestor padding, which a
    // full-viewport-height child ignores.
    const defaultHeightClass = classes.find((c) => /^h-/.test(c) && !c.includes(":"));
    expect(defaultHeightClass).toBe("h-[calc(100dvh-4rem)]");
  });

  it("goes back to full viewport height at lg, where the nav is a left rail and takes no vertical space", async () => {
    const Home = (await import("@/app/page")).default;
    const { container } = render(<Home />);

    const root = container.firstElementChild as HTMLElement;
    const classes = root.className.split(/\s+/);

    expect(classes).toContain("lg:h-dvh");
  });
});

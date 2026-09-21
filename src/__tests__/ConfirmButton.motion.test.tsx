import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConfirmButton from "@/components/ConfirmButton";
import { CONFIRMATION_THRESHOLD, type Spot } from "@/lib/spots";

/**
 * paseo-motion Wave 2.3 fix round 2 (.claude/prds/paseo-motion.md) --
 * "confirming should feel earned, not like a badge swap". This replaces
 * the round-1 version of this file, which the reviewer correctly flagged:
 * it only asserted the animation exists on a freshly-rendered
 * already-confirmed spot and never asserted the inverse, so it could not
 * catch the animation replaying on every mount.
 *
 * The contract under test: the drawn-on `.paseo-mark` checkmark and the
 * `.paseo-confirm-pulse` ring fire once, only on the transition from
 * not-confirmed to confirmed while a single ConfirmButton instance stays
 * mounted -- never for a spot that is already confirmed the moment it
 * renders, and never again if that same instance unmounts and remounts.
 *
 * Frozen constraint this file must not trip (PRD "Test constraints"):
 * ConfirmButton.test.tsx:60 pins the badge text to exactly /^confirmed$/i,
 * so the pulse span must add zero text in either state.
 */
function makeSpot(overrides: Partial<Spot> = {}): Spot {
  return {
    id: "spot-1",
    name: "Fort Pilar",
    note: "Historic fort.",
    lat: 6.9098,
    lng: 122.079,
    status: "unconfirmed",
    confirmations: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeConfirmedSpot(overrides: Partial<Spot> = {}): Spot {
  return makeSpot({ status: "confirmed", confirmations: CONFIRMATION_THRESHOLD, ...overrides });
}

afterEach(() => {
  cleanup();
});

describe("ConfirmButton motion -- confirm earned, not replayed", () => {
  it("a spot that is already confirmed on first render shows the badge with no draw-on and no pulse", () => {
    const { container } = render(<ConfirmButton spot={makeConfirmedSpot()} onConfirm={vi.fn()} />);

    expect(screen.getByText(/^confirmed$/i)).toBeInTheDocument();
    expect(container.querySelector("svg path.paseo-mark")).toBeNull();
    expect(container.querySelectorAll(".paseo-confirm-pulse")).toHaveLength(0);
  });

  it("a spot confirmed during this session animates exactly once", () => {
    const { container, rerender } = render(
      <ConfirmButton spot={makeSpot({ status: "unconfirmed", confirmations: 1 })} onConfirm={vi.fn()} />,
    );

    // Before the transition: no animation hooks yet (still the CTA button,
    // not the badge at all).
    expect(container.querySelector("svg path.paseo-mark")).toBeNull();
    expect(container.querySelectorAll(".paseo-confirm-pulse")).toHaveLength(0);

    // The confirm action completing flows back down as a status flip on
    // the same spot object, without this ConfirmButton ever unmounting.
    rerender(<ConfirmButton spot={makeConfirmedSpot()} onConfirm={vi.fn()} />);

    expect(screen.getByText(/^confirmed$/i)).toBeInTheDocument();
    expect(container.querySelector("svg path.paseo-mark")).not.toBeNull();
    const pulses = container.querySelectorAll(".paseo-confirm-pulse");
    expect(pulses).toHaveLength(1);
    expect(pulses[0].getAttribute("aria-hidden")).toBe("true");
    expect(pulses[0].textContent).toBe("");

    // Re-rendering again with the same confirmed spot must not re-arm or
    // duplicate the animation.
    rerender(<ConfirmButton spot={makeConfirmedSpot()} onConfirm={vi.fn()} />);
    expect(container.querySelectorAll(".paseo-confirm-pulse")).toHaveLength(1);
  });

  it("remounting a card that was confirmed earlier does not replay the animation", () => {
    const first = render(
      <ConfirmButton spot={makeSpot({ status: "unconfirmed", confirmations: 1 })} onConfirm={vi.fn()} />,
    );
    first.rerender(<ConfirmButton spot={makeConfirmedSpot()} onConfirm={vi.fn()} />);
    expect(first.container.querySelector("svg path.paseo-mark")).not.toBeNull();
    first.unmount();

    // A brand-new mount of the same, now-confirmed spot -- e.g. the deck
    // scrolling this card back into the +/-2 window, or a popup reopened.
    const second = render(<ConfirmButton spot={makeConfirmedSpot()} onConfirm={vi.fn()} />);
    expect(screen.getByText(/^confirmed$/i)).toBeInTheDocument();
    expect(second.container.querySelector("svg path.paseo-mark")).toBeNull();
    expect(second.container.querySelectorAll(".paseo-confirm-pulse")).toHaveLength(0);
  });

  it("the pulse span never pollutes the badge's accessible text, in either the static or animated case", () => {
    render(<ConfirmButton spot={makeConfirmedSpot()} onConfirm={vi.fn()} />);
    expect(screen.getAllByText(/^confirmed$/i)).toHaveLength(1);
  });
});

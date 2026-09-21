import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ConfirmButton from "@/components/ConfirmButton";
import { CONFIRMATION_THRESHOLD, type Spot } from "@/lib/spots";

/**
 * paseo-motion Wave 2.3 (.claude/prds/paseo-motion.md) -- "confirming
 * should feel earned, not like a badge swap". Covers the two motion hooks
 * ConfirmButton owns once a spot is confirmed: the drawn-on `.paseo-mark`
 * checkmark and the single `.paseo-confirm-pulse` ring. Frozen constraints
 * this file must not trip (see PRD "Test constraints"):
 * ConfirmButton.test.tsx:60 pins the badge text to exactly /^confirmed$/i,
 * so the pulse span must add zero text.
 */
function makeConfirmedSpot(overrides: Partial<Spot> = {}): Spot {
  return {
    id: "spot-1",
    name: "Fort Pilar",
    note: "Historic fort.",
    lat: 6.9098,
    lng: 122.079,
    status: "confirmed",
    confirmations: CONFIRMATION_THRESHOLD,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("ConfirmButton motion -- confirm earned", () => {
  it("draws the confirmed mark with .paseo-mark", () => {
    const { container } = render(<ConfirmButton spot={makeConfirmedSpot()} onConfirm={vi.fn()} />);

    expect(container.querySelector("svg path.paseo-mark")).not.toBeNull();
  });

  it("renders exactly one pulse ring that is aria-hidden and carries no text", () => {
    const { container } = render(<ConfirmButton spot={makeConfirmedSpot()} onConfirm={vi.fn()} />);

    const pulses = container.querySelectorAll(".paseo-confirm-pulse");
    expect(pulses).toHaveLength(1);
    expect(pulses[0].getAttribute("aria-hidden")).toBe("true");
    expect(pulses[0].textContent).toBe("");
  });

  it("the pulse span does not pollute the badge's text -- /^confirmed$/i still matches exactly one element", () => {
    render(<ConfirmButton spot={makeConfirmedSpot()} onConfirm={vi.fn()} />);

    expect(screen.getByText(/^confirmed$/i)).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConfirmButton from "@/components/ConfirmButton";
import { CONFIRMATION_THRESHOLD, type Spot } from "@/lib/spots";

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

/**
 * ASSUMPTION (documented per task instructions): the given prop shape for
 * ConfirmButton is fixed at `{ spot, onConfirm }` -- there is no separate
 * "have I confirmed this" prop and no confirmerId prop. Since Spot itself
 * (src/lib/spots.ts) has no field recording who confirmed a spot, the only
 * place left to carry that signal without changing the given prop shape is
 * on the `spot` object itself. This test assumes the caller (whoever wires
 * ConfirmButton up against local-identity.ts + the repo) attaches an extra
 * `confirmedByMe: boolean` field onto the spot object before handing it to
 * ConfirmButton, and that ConfirmButton reads `spot.confirmedByMe` to decide
 * whether it's disabled/a no-op. This is a genuine assumption, not part of
 * the given contract -- if the real implementation signals this some other
 * way (e.g. a context, or comparing an array of confirmer ids), these two
 * "already confirmed" tests will need to be adjusted to match.
 */
type SpotWithLocalFlag = Spot & { confirmedByMe?: boolean };

describe("ConfirmButton", () => {
  it("renders the call-to-action label when unconfirmed and not yet confirmed by this browser", () => {
    const spot = makeSpot({ status: "unconfirmed", confirmations: 0 });
    render(<ConfirmButton spot={spot} onConfirm={vi.fn()} />);

    expect(screen.getByRole("button", { name: /confirm.*been here/i })).toBeInTheDocument();
  });

  it("calls onConfirm exactly once when clicked while eligible to confirm", async () => {
    const onConfirm = vi.fn();
    const spot = makeSpot({ status: "unconfirmed", confirmations: 0 });
    render(<ConfirmButton spot={spot} onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole("button", { name: /confirm.*been here/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it(`shows a distinct 'Confirmed' state once the spot has reached CONFIRMATION_THRESHOLD (currently ${CONFIRMATION_THRESHOLD})`, () => {
    const spot = makeSpot({ status: "confirmed", confirmations: CONFIRMATION_THRESHOLD });
    render(<ConfirmButton spot={spot} onConfirm={vi.fn()} />);

    expect(screen.getByText(/^confirmed$/i)).toBeInTheDocument();
    // Must not still be advertising the "come confirm me" call to action.
    expect(screen.queryByText(/i.?ve been here/i)).not.toBeInTheDocument();
  });

  it("is disabled and never calls onConfirm when this browser already confirmed the spot (see documented assumption above)", async () => {
    const onConfirm = vi.fn();
    const spot: SpotWithLocalFlag = {
      ...makeSpot({ status: "unconfirmed", confirmations: 1 }),
      confirmedByMe: true,
    };
    render(<ConfirmButton spot={spot} onConfirm={onConfirm} />);

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows the Chavacano primary text 'Ya anda yo aqui' for the call-to-action state, while the accessible name stays the English 'I've been here' (Ciudad Latina redesign, spec Task 4)", () => {
    const spot = makeSpot({ status: "unconfirmed", confirmations: 0 });
    render(<ConfirmButton spot={spot} onConfirm={vi.fn()} />);

    expect(screen.getByText(/ya anda yo aqui/i)).toBeInTheDocument();
    // Regression net: the English name must still resolve the button.
    expect(screen.getByRole("button", { name: /i.?ve been here/i })).toBeInTheDocument();
  });
});

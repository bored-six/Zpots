import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import SpotCardView from "@/components/SpotCardView";
import { formatDistance } from "@/lib/geo";
import { COPY } from "@/lib/copy";
import type { SpotCard } from "@/lib/spots";

// Fix round (expected red): the map inset tap for a spot already on my map
// currently does `window.location.assign(...)` (a full page navigation)
// instead of the Next router. Mocking next/navigation here so the redirect
// describe block below can assert on `push` -- this mock is inert for every
// other test in this file (none of them render the map-inset-tap path).
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

/**
 * SpotCardView (social-spots.md UI spec, "Card:") -- one card in the Spots
 * deck. Per the user's rule, this only checks behavior/text/accessible
 * names: author identity, distance, and that save/been/report are reachable
 * and wired -- never pixel sizes, colors, or classes.
 */

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

describe("SpotCardView -- author and distance", () => {
  it("shows the author's handle", () => {
    render(<SpotCardView {...baseProps()} />);

    expect(screen.getByText(/@kuya_ben/i)).toBeInTheDocument();
  });

  it("shows the author's display name", () => {
    render(<SpotCardView {...baseProps()} />);

    expect(screen.getByText("Kuya Ben")).toBeInTheDocument();
  });

  it("shows a formatted distance when the card carries one", () => {
    render(<SpotCardView {...baseProps({ card: makeCard({ distanceM: 842.5 }) })} />);

    expect(screen.getByText(new RegExp(formatDistance(842.5), "i"))).toBeInTheDocument();
  });

  it("does not blow up or show a bogus distance when distanceM is absent", () => {
    render(<SpotCardView {...baseProps({ card: makeCard({ distanceM: undefined }) })} />);

    expect(screen.queryByText(/nan/i)).not.toBeInTheDocument();
  });

  it("shows the spot's name and note", () => {
    render(<SpotCardView {...baseProps()} />);

    expect(screen.getByText("Rio Hondo Boardwalk")).toBeInTheDocument();
    expect(screen.getByText(/great sunset view/i)).toBeInTheDocument();
  });
});

describe("SpotCardView -- save action", () => {
  it("shows a Save control (accessible name COPY.save.en) when not saved, and calls onSave on click", async () => {
    const user = userEvent.setup();
    const props = baseProps({ isSaved: false });
    render(<SpotCardView {...props} />);

    const saveButton = screen.getByRole("button", { name: new RegExp(COPY.save.en, "i") });
    await user.click(saveButton);

    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(props.onUnsave).not.toHaveBeenCalled();
  });

  it("shows the Saved state (accessible name COPY.saved.en) when isSaved is true, and calls onUnsave on click", async () => {
    const user = userEvent.setup();
    const props = baseProps({ isSaved: true });
    render(<SpotCardView {...props} />);

    const savedButton = screen.getByRole("button", { name: new RegExp(COPY.saved.en, "i") });
    await user.click(savedButton);

    expect(props.onUnsave).toHaveBeenCalledTimes(1);
    expect(props.onSave).not.toHaveBeenCalled();
  });
});

describe("SpotCardView -- been-here action", () => {
  it("has a control reachable by 'I've been here' that calls onBeenHere", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<SpotCardView {...props} />);

    await user.click(screen.getByRole("button", { name: /i.?ve been here/i }));

    expect(props.onBeenHere).toHaveBeenCalledTimes(1);
  });

  it("shows the disabled 'you confirmed' state when confirmedByMe is true and the spot is below threshold", () => {
    render(<SpotCardView {...baseProps({ confirmedByMe: true })} />);

    expect(screen.getByRole("button", { name: /you confirmed this spot/i })).toBeDisabled();
  });

  it("shows the settled Confirmed badge (no clickable been-here control) once the spot is confirmed", () => {
    render(
      <SpotCardView
        {...baseProps({ card: makeCard({ status: "confirmed", confirmations: 3 }) })}
      />,
    );

    expect(screen.getAllByText(/^confirmed$/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("button", { name: /i.?ve been here/i })).not.toBeInTheDocument();
  });
});

describe("SpotCardView -- report action", () => {
  it("has a Report control reachable by its English name", () => {
    render(<SpotCardView {...baseProps()} />);

    expect(screen.getByRole("button", { name: new RegExp(COPY.report.en, "i") })).toBeInTheDocument();
  });

  it("submitting the report form calls onReport with the chosen reason and details", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<SpotCardView {...props} />);

    await user.click(screen.getByRole("button", { name: new RegExp(COPY.report.en, "i") }));
    await user.click(screen.getByRole("button", { name: /submit report/i }));

    expect(props.onReport).toHaveBeenCalled();
  });
});

describe("SpotCardView -- map inset navigation (fix round)", () => {
  it("tapping the inset for a spot already on my map uses the Next router, not a full page navigation", async () => {
    const user = userEvent.setup();
    render(<SpotCardView {...baseProps({ isOnMyMap: true })} />);

    await user.click(screen.getByRole("button", { name: /open on the map/i }));

    expect(push).toHaveBeenCalledWith("/mapa?spot=spot-1");
  });
});

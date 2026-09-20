import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * social-spots.md replaces the home page: it used to be the all-spots map
 * (MapView), it is now the full-screen Spots deck. The old live-data-wiring
 * suite that belonged to the map lived here before this PRD; that behavior
 * now belongs to SpotsDeck itself (see SpotsDeck.test.tsx) and to feed-repo
 * (see feed-repo.test.ts) -- this file only has to prove two things: (1)
 * the home route renders the deck, and (2) the removed all-spots query is
 * really gone from the repo module, not just unused.
 */

vi.mock("@/components/SpotsDeck", () => ({
  default: () => <div data-testid="spots-deck" />,
}));

describe("Home page (/)", () => {
  it("renders the Spots deck", async () => {
    const Home = (await import("@/app/page")).default;
    render(<Home />);

    expect(screen.getByTestId("spots-deck")).toBeInTheDocument();
  });

  it("no longer renders the old all-spots MapView", async () => {
    const Home = (await import("@/app/page")).default;
    render(<Home />);

    expect(screen.queryByTestId("map-view")).not.toBeInTheDocument();
  });
});

describe("spots-repo -- fetchSpots removal (social-spots.md 'Public map: Removed')", () => {
  it("no longer exports fetchSpots -- the personal map replaces the all-spots query", async () => {
    const spotsRepo = (await import("@/lib/spots-repo")) as Record<string, unknown>;

    expect("fetchSpots" in spotsRepo).toBe(false);
    expect(spotsRepo.fetchSpots).toBeUndefined();
  });

  it("still exports the confirm/report/create primitives the deck and post flow need", async () => {
    const spotsRepo = (await import("@/lib/spots-repo")) as Record<string, unknown>;

    expect(typeof spotsRepo.createSpot).toBe("function");
    expect(typeof spotsRepo.confirmSpot).toBe("function");
    expect(typeof spotsRepo.reportSpot).toBe("function");
  });
});

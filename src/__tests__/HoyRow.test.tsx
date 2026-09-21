import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HoyRow from "@/components/HoyRow";
import type { HoyEntry } from "@/lib/feed-repo";

/**
 * paseo-motion Wave 2.4 (.claude/prds/paseo-motion.md) -- "the vinta ring
 * rotates only for people who posted in the last hour". `.vinta-ring[data-
 * fresh="true"]` (globals.css, Wave 1) is the only hook this component
 * needs to set; the boundary itself lives here, tested from both sides.
 * `NOW` is fixed with fake timers so the 1-hour math never depends on the
 * real clock.
 */
const NOW = new Date("2026-09-21T12:00:00.000Z");

function makeEntry(overrides: Partial<HoyEntry> = {}): HoyEntry {
  return {
    spotId: "spot-1",
    createdAt: NOW.toISOString(),
    author: { id: "user-2", handle: "kuya_ben", displayName: "Kuya Ben", avatarUrl: null },
    ...overrides,
  };
}

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60 * 1000).toISOString();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HoyRow", () => {
  it("renders nothing when there are no entries", () => {
    const { container } = render(<HoyRow entries={[]} onSelect={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("marks a 59-minute-old post as fresh (data-fresh=\"true\")", () => {
    const { container } = render(
      <HoyRow entries={[makeEntry({ createdAt: minutesAgo(59) })]} onSelect={vi.fn()} />,
    );

    expect(container.querySelector(".vinta-ring")?.getAttribute("data-fresh")).toBe("true");
  });

  it("does not mark a 61-minute-old post as fresh", () => {
    const { container } = render(
      <HoyRow entries={[makeEntry({ createdAt: minutesAgo(61) })]} onSelect={vi.fn()} />,
    );

    expect(container.querySelector(".vinta-ring")?.getAttribute("data-fresh")).toBe("false");
  });

  it("does not crash on a malformed createdAt and treats it as not fresh", () => {
    const { container } = render(
      <HoyRow entries={[makeEntry({ createdAt: "not-a-real-timestamp" })]} onSelect={vi.fn()} />,
    );

    expect(container.querySelector(".vinta-ring")?.getAttribute("data-fresh")).toBe("false");
  });
});

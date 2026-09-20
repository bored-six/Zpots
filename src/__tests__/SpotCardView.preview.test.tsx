import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SpotCardView from "@/components/SpotCardView";
import { COPY } from "@/lib/copy";
import { PREVIEW_SPOTS } from "@/lib/preview-spots";
import type { SpotCard } from "@/lib/spots";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

/**
 * A preview card is read-only: the preview account has no profile page,
 * and Save / Been / Report would all hit RPCs with an id that does not
 * exist in the database. The card has to know this from the card alone
 * (its id), since SpotsDeck's stub in the frozen deck suite passes no
 * extra prop.
 */
function makeRealCard(): SpotCard {
  return {
    id: "spot-1",
    name: "Rio Hondo Boardwalk",
    note: "Great sunset view.",
    lat: 6.9,
    lng: 122.05,
    status: "unconfirmed",
    confirmations: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    author: { id: "user-2", handle: "kuya_ben", displayName: "Kuya Ben", avatarUrl: null },
  };
}

function baseProps(card: SpotCard) {
  return {
    card,
    isSaved: false,
    confirmedByMe: false,
    onSave: vi.fn(),
    onUnsave: vi.fn(),
    onBeenHere: vi.fn(),
    onReport: vi.fn(),
    authStatus: "signed-in" as const,
  };
}

describe("SpotCardView -- preview card", () => {
  const preview = PREVIEW_SPOTS[0];

  it("hides Save, I've been here, and Report", () => {
    render(<SpotCardView {...baseProps(preview)} />);

    expect(screen.queryByRole("button", { name: new RegExp(COPY.save.en, "i") })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: new RegExp(COPY.saved.en, "i") })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /i've been here/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: new RegExp(`^${COPY.report.en}$`, "i") })).not.toBeInTheDocument();
  });

  it("shows a Preview label", () => {
    render(<SpotCardView {...baseProps(preview)} />);

    expect(screen.getByText(COPY.preview.en)).toBeInTheDocument();
  });

  it("still shows the spot's name, note, and the preview author's handle -- but not as a profile link", () => {
    render(<SpotCardView {...baseProps(preview)} />);

    expect(screen.getByText(preview.name)).toBeInTheDocument();
    expect(screen.getByText(preview.note)).toBeInTheDocument();
    expect(screen.getByText(`@${preview.author.handle}`)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: new RegExp(preview.author.handle, "i") })).not.toBeInTheDocument();
    expect(document.querySelector(`a[href="/u/${preview.author.handle}"]`)).toBeNull();
  });

  it("shows the photo credit", () => {
    render(<SpotCardView {...baseProps(preview)} />);

    expect(screen.getByText(new RegExp(preview.photoCredit!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))).toBeInTheDocument();
  });

  it("a real card is unchanged: Save is still there, no Preview label", () => {
    render(<SpotCardView {...baseProps(makeRealCard())} />);

    expect(screen.getByRole("button", { name: new RegExp(COPY.save.en, "i") })).toBeInTheDocument();
    expect(screen.queryByText(COPY.preview.en)).not.toBeInTheDocument();
  });
});

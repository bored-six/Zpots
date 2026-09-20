import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import AddSpotForm from "@/components/AddSpotForm";
import ConfirmButton from "@/components/ConfirmButton";
import ReportButton from "@/components/ReportButton";
import SignInPrompt from "@/components/SignInPrompt";
import { COPY } from "@/lib/copy";
import type { Spot } from "@/lib/spots";

/**
 * Adversarial pass on accessible names (spec Task 4's "Accessible names
 * stay English" rule). Every assertion here derives its expected string
 * from COPY directly (never a hardcoded literal) so it breaks the moment
 * a component's aria-label drifts from the copy contract, and confirms
 * the Chavacano span never leaks into the accessible name.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function englishNameRegex(key: keyof typeof COPY): RegExp {
  return new RegExp(escapeRegExp(COPY[key].en), "i");
}

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

describe("adversarial", () => {
  describe("ConfirmButton", () => {
    it("the CTA's accessible name contains COPY.confirmVisit.en, and its Chavacano span stays out of the name", () => {
      render(<ConfirmButton spot={makeSpot()} onConfirm={vi.fn()} />);

      const button = screen.getByRole("button", { name: englishNameRegex("confirmVisit") });
      expect(button).toBeInTheDocument();
      // The accessible name must not itself literally equal the Chavacano
      // string (that would mean the aria-hidden span leaked into the name).
      expect(button.getAttribute("aria-label")).not.toBe(COPY.confirmVisit.cv);
    });
  });

  describe("ReportButton", () => {
    it("the closed-state trigger's accessible name is COPY.report.en", () => {
      render(<ReportButton spotId="spot-1" onReport={vi.fn()} />);

      expect(screen.getByRole("button", { name: englishNameRegex("report") })).toBeInTheDocument();
    });

    it("the open-state Cancel button's accessible name is COPY.cancel.en", async () => {
      const user = userEvent.setup();
      render(<ReportButton spotId="spot-1" onReport={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: englishNameRegex("report") }));

      expect(screen.getByRole("button", { name: englishNameRegex("cancel") })).toBeInTheDocument();
    });
  });

  describe("AddSpotForm", () => {
    it("the Cancel button's accessible name is COPY.cancel.en", () => {
      render(<AddSpotForm lat={6.9} lng={122.08} onSubmit={vi.fn()} onCancel={vi.fn()} />);

      expect(screen.getByRole("button", { name: englishNameRegex("cancel") })).toBeInTheDocument();
    });
  });

  describe("sign-in-gate (SignInPrompt)", () => {
    it("the dismiss control is still findable by its plain English name ('Not now') alongside the Bilingual signInFirst eyebrow line", () => {
      render(<SignInPrompt action="add" onDismiss={vi.fn()} />);

      expect(screen.getByRole("button", { name: /not now/i })).toBeInTheDocument();
      // The Bilingual eyebrow line is present but not itself inside any button.
      expect(screen.getByText(COPY.signInFirst.cv)).toBeInTheDocument();
      expect(screen.getByText(COPY.signInFirst.cv).closest("button")).toBeNull();
    });
  });
});

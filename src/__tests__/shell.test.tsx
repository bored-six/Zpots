import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ status: "signed-out" }),
}));

import ClipboardShell from "@/components/ClipboardShell";

describe("ClipboardShell -- plaza / stone-wall redesign", () => {
  it("renders the Zpots wordmark", () => {
    render(
      <ClipboardShell>
        <p>content</p>
      </ClipboardShell>,
    );
    expect(screen.getByText("Zpots")).toBeInTheDocument();
  });

  it("renders the 'CIUDAD DE ZAMBOANGA' section label", () => {
    render(
      <ClipboardShell>
        <p>content</p>
      </ClipboardShell>,
    );
    expect(screen.getByText(/ciudad de zamboanga/i)).toBeInTheDocument();
  });

  it("renders a .vinta-rule element", () => {
    const { container } = render(
      <ClipboardShell>
        <p>content</p>
      </ClipboardShell>,
    );
    expect(container.querySelector(".vinta-rule")).not.toBeNull();
  });

  it("does not render anything with a class or test-id containing 'binder' (the binder-clip motif is retired)", () => {
    const { container } = render(
      <ClipboardShell>
        <p>content</p>
      </ClipboardShell>,
    );
    expect(container.querySelector('[class*="binder" i]')).toBeNull();
    expect(container.querySelector('[data-testid*="binder" i]')).toBeNull();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import SignInPrompt from "@/components/SignInPrompt";

describe("SignInPrompt", () => {
  it("shows the 'add' copy and links", () => {
    render(<SignInPrompt action="add" onDismiss={vi.fn()} />);

    expect(screen.getByText(/sign in to add a spot/i)).toBeInTheDocument();
    expect(screen.getByText(/tied to an account/i)).toBeInTheDocument();
  });

  it("shows the 'confirm' copy", () => {
    render(<SignInPrompt action="confirm" onDismiss={vi.fn()} />);

    expect(screen.getByText(/sign in to confirm/i)).toBeInTheDocument();
    expect(screen.getByText(/one confirmation per person/i)).toBeInTheDocument();
  });

  it("shows the 'report' copy", () => {
    render(<SignInPrompt action="report" onDismiss={vi.fn()} />);

    expect(screen.getByText(/sign in to report/i)).toBeInTheDocument();
    expect(screen.getByText(/signal for a human/i)).toBeInTheDocument();
  });

  it("'Sign in' links to /login?next=/", () => {
    render(<SignInPrompt action="add" onDismiss={vi.fn()} />);

    expect(screen.getByRole("link", { name: /^sign in$/i })).toHaveAttribute("href", "/login?next=/");
  });

  it("'Create an account' links to /login?mode=signup&next=/", () => {
    render(<SignInPrompt action="add" onDismiss={vi.fn()} />);

    expect(screen.getByRole("link", { name: /create an account/i })).toHaveAttribute(
      "href",
      "/login?mode=signup&next=/",
    );
  });

  it("'Not now' calls onDismiss exactly once", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<SignInPrompt action="add" onDismiss={onDismiss} />);

    await user.click(screen.getByRole("button", { name: /not now/i }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("pressing Escape calls onDismiss exactly once", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<SignInPrompt action="add" onDismiss={onDismiss} />);

    await user.keyboard("{Escape}");

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("clicking the dimmed backdrop calls onDismiss exactly once", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<SignInPrompt action="add" onDismiss={onDismiss} />);

    const backdrop = container.querySelector('[role="dialog"]')?.parentElement;
    expect(backdrop).toBeTruthy();
    await user.click(backdrop as Element);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("clicking inside the card does not call onDismiss", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<SignInPrompt action="add" onDismiss={onDismiss} />);

    await user.click(screen.getByRole("heading"));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('has role="dialog", aria-modal, and is labelled by its heading', () => {
    render(<SignInPrompt action="confirm" onDismiss={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const heading = screen.getByRole("heading");
    expect(dialog).toHaveAttribute("aria-labelledby", heading.id);
  });

  it("moves focus to the heading on mount", async () => {
    render(<SignInPrompt action="add" onDismiss={vi.fn()} />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("heading")).toHaveFocus();
  });

  it("shows the Chavacano primary text 'Entra primero' (COPY.signInFirst) somewhere in the dialog, while the existing English heading query still resolves (Ciudad Latina redesign, spec Task 4)", () => {
    render(<SignInPrompt action="add" onDismiss={vi.fn()} />);

    expect(screen.getByText(/entra primero/i)).toBeInTheDocument();
    // Regression net: the existing English-text query must still pass.
    expect(screen.getByText(/sign in to add a spot/i)).toBeInTheDocument();
  });
});

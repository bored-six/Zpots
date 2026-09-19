import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Interaction model decision: the real Settings component's exact UX isn't
 * fixed yet, so we pick ONE clear, testable model rather than testing both
 * speculatively -- save-on-blur (no separate "Save" button). Rationale:
 * this is a single low-stakes cosmetic field (spec: nickname is "purely
 * cosmetic, never a verified identity" -- src/lib/validation.ts), so a
 * lightweight autosave-on-blur matches its low stakes better than adding a
 * dedicated Save button + success/error state for one text field. If the
 * implementer instead builds an explicit Save button, this interaction
 * assertion (and only this one) will need updating -- every other
 * assertion in this file is interaction-model-agnostic.
 */

const getStoredNickname = vi.fn();
const setStoredNickname = vi.fn();
const clearStoredNickname = vi.fn();
const getLocallyConfirmedSpotIds = vi.fn();
const markSpotConfirmedLocally = vi.fn();
const clearAllLocalData = vi.fn();

vi.mock("@/lib/nickname-storage", () => ({
  MAX_STORED_NICKNAME_LENGTH: 40,
  getStoredNickname: (...args: unknown[]) => getStoredNickname(...args),
  setStoredNickname: (...args: unknown[]) => setStoredNickname(...args),
  clearStoredNickname: (...args: unknown[]) => clearStoredNickname(...args),
}));

vi.mock("@/lib/confirmed-spots-storage", () => ({
  getLocallyConfirmedSpotIds: (...args: unknown[]) => getLocallyConfirmedSpotIds(...args),
  markSpotConfirmedLocally: (...args: unknown[]) => markSpotConfirmedLocally(...args),
}));

vi.mock("@/lib/local-data-reset", () => ({
  clearAllLocalData: (...args: unknown[]) => clearAllLocalData(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getStoredNickname.mockReturnValue("");
  getLocallyConfirmedSpotIds.mockReturnValue(new Set<string>());
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("Settings page", () => {
  it("renders a nickname text input pre-filled with getStoredNickname()", async () => {
    getStoredNickname.mockReturnValue("Kuya Ben");

    const SettingsPage = (await import("@/app/settings/page")).default;
    render(<SettingsPage />);

    const input = screen.getByRole("textbox", { name: /nickname/i });
    expect(input).toHaveValue("Kuya Ben");
  });

  it("calls setStoredNickname with the trimmed value when the nickname field loses focus after being edited", async () => {
    getStoredNickname.mockReturnValue("");

    const SettingsPage = (await import("@/app/settings/page")).default;
    const user = userEvent.setup();
    render(<SettingsPage />);

    const input = screen.getByRole("textbox", { name: /nickname/i });
    await user.click(input);
    await user.type(input, "  Ate Joy  ");
    await user.tab(); // moves focus away -- triggers blur

    expect(setStoredNickname).toHaveBeenCalledWith("Ate Joy");
  });

  it("renders the count of locally confirmed spots accurately", async () => {
    getLocallyConfirmedSpotIds.mockReturnValue(new Set(["a", "b", "c"]));

    const SettingsPage = (await import("@/app/settings/page")).default;
    render(<SettingsPage />);

    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it("renders a count of 0 when nothing has been confirmed locally", async () => {
    getLocallyConfirmedSpotIds.mockReturnValue(new Set());

    const SettingsPage = (await import("@/app/settings/page")).default;
    render(<SettingsPage />);

    expect(screen.getByText(/0/)).toBeInTheDocument();
  });

  it("has a control to clear local data that confirms via window.confirm before clearing", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    const SettingsPage = (await import("@/app/settings/page")).default;
    const user = userEvent.setup();
    render(<SettingsPage />);

    const clearControl = screen.getByRole("button", { name: /clear.*local data/i });
    await user.click(clearControl);

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(clearAllLocalData).toHaveBeenCalledTimes(1);
  });

  it("does NOT clear local data when window.confirm is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);

    const SettingsPage = (await import("@/app/settings/page")).default;
    const user = userEvent.setup();
    render(<SettingsPage />);

    const clearControl = screen.getByRole("button", { name: /clear.*local data/i });
    await user.click(clearControl);

    expect(clearAllLocalData).not.toHaveBeenCalled();
  });

  it("updates the confirmed-count display to 0 immediately after a successful clear, without a manual reload", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    getLocallyConfirmedSpotIds.mockReturnValue(new Set(["a", "b", "c"]));
    // Real clearAllLocalData empties underlying storage; here we simulate
    // that by having the mocked getter reflect the post-clear state once
    // clearAllLocalData has actually been invoked, and asserting the
    // component re-reads it (rather than just decrementing local state).
    clearAllLocalData.mockImplementation(() => {
      getLocallyConfirmedSpotIds.mockReturnValue(new Set());
    });

    const SettingsPage = (await import("@/app/settings/page")).default;
    const user = userEvent.setup();
    render(<SettingsPage />);

    expect(screen.getByText(/3/)).toBeInTheDocument();

    const clearControl = screen.getByRole("button", { name: /clear.*local data/i });
    await user.click(clearControl);

    await waitFor(() => {
      expect(screen.queryByText(/3/)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/0/)).toBeInTheDocument();
  });

  it("contains a real link (not a div) back to the home page", async () => {
    const SettingsPage = (await import("@/app/settings/page")).default;
    render(<SettingsPage />);

    const homeLink = screen.getByRole("link", { name: /home|back/i });
    expect(homeLink).toHaveAttribute("href", "/");
  });

  it("includes the required OpenStreetMap attribution credit", async () => {
    const SettingsPage = (await import("@/app/settings/page")).default;
    render(<SettingsPage />);

    expect(screen.getByText(/OpenStreetMap/i)).toBeInTheDocument();
  });
});

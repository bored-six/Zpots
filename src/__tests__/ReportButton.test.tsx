import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ReportButton from "@/components/ReportButton";
import { REPORT_REASONS } from "@/lib/validation";

/**
 * ASSUMPTION (documented, same spirit as the ConfirmButton note): the
 * contract says the control "lets the user pick one of REPORT_REASONS and
 * submit" but doesn't name a UI widget. This test assumes the picker is a
 * native <select> whose <option> values are exactly the REPORT_REASONS
 * strings, opened by a "Report" trigger button, with a separate submit
 * control whose accessible name contains "submit". If the real
 * implementation uses radios/buttons instead of a <select>, the selection
 * step below will need to change to match.
 */
async function openReportFlow() {
  await userEvent.click(screen.getByRole("button", { name: /report/i }));
}

function getReasonSelect() {
  return screen.getByRole("combobox");
}

function getSubmitControl() {
  return screen.getByRole("button", { name: /submit/i });
}

describe("ReportButton", () => {
  it("does not call onReport before the report control is activated", () => {
    const onReport = vi.fn();
    render(<ReportButton spotId="spot-1" onReport={onReport} />);

    expect(screen.getByRole("button", { name: /report/i })).toBeInTheDocument();
    expect(onReport).not.toHaveBeenCalled();
  });

  it("offers an option for every value in REPORT_REASONS once activated", async () => {
    render(<ReportButton spotId="spot-1" onReport={vi.fn()} />);
    await openReportFlow();

    const select = getReasonSelect();
    const optionValues = Array.from(select.querySelectorAll("option")).map(
      (o) => (o as HTMLOptionElement).value,
    );

    for (const reason of REPORT_REASONS) {
      expect(optionValues).toContain(reason);
    }
  });

  it.each(REPORT_REASONS)(
    "calls onReport with '%s' when that reason is selected and submitted",
    async (reason) => {
      const onReport = vi.fn();
      render(<ReportButton spotId="spot-1" onReport={onReport} />);
      await openReportFlow();

      await userEvent.selectOptions(getReasonSelect(), reason);
      await userEvent.click(getSubmitControl());

      expect(onReport).toHaveBeenCalledTimes(1);
      expect(onReport.mock.calls[0][0]).toBe(reason);
    },
  );

  it("passes the spotId's associated report through onReport exactly once per submit (no duplicate calls)", async () => {
    const onReport = vi.fn();
    render(<ReportButton spotId="spot-1" onReport={onReport} />);
    await openReportFlow();

    await userEvent.selectOptions(getReasonSelect(), REPORT_REASONS[0]);
    await userEvent.click(getSubmitControl());

    expect(onReport).toHaveBeenCalledTimes(1);
  });

  it("shows the Chavacano primary text 'Reporta' on the trigger, while the accessible name stays the English 'Report' (Ciudad Latina redesign, spec Task 4)", () => {
    render(<ReportButton spotId="spot-1" onReport={vi.fn()} />);

    expect(screen.getByText(/^reporta$/i)).toBeInTheDocument();
    // Regression net: the English name must still resolve the trigger button.
    expect(screen.getByRole("button", { name: /report/i })).toBeInTheDocument();
  });
});

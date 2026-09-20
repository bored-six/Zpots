import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Bilingual from "@/components/Bilingual";
import { COPY } from "@/lib/copy";

describe("Bilingual", () => {
  it("renders both the Chavacano primary and English secondary text for a key", () => {
    render(<Bilingual k="confirmVisit" />);

    expect(screen.getByText(COPY.confirmVisit.cv)).toBeInTheDocument();
    expect(screen.getByText(COPY.confirmVisit.en)).toBeInTheDocument();
  });

  it("the Chavacano (primary) span is aria-hidden, so it doesn't double up the accessible name", () => {
    render(<Bilingual k="addSpot" />);

    const cvSpan = screen.getByText(COPY.addSpot.cv);
    expect(cvSpan).toHaveAttribute("aria-hidden", "true");
  });

  it("the English (secondary) span is not aria-hidden", () => {
    render(<Bilingual k="addSpot" />);

    const enSpan = screen.getByText(COPY.addSpot.en);
    expect(enSpan).not.toHaveAttribute("aria-hidden");
  });

  it("renders different copy for a different key", () => {
    render(<Bilingual k="report" />);

    expect(screen.getByText(COPY.report.cv)).toBeInTheDocument();
    expect(screen.getByText(COPY.report.en)).toBeInTheDocument();
  });
});

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

  describe("tone prop", () => {
    it("defaults to 'muted': the English span is text-stone-deep", () => {
      render(<Bilingual k="addSpot" />);

      const enSpan = screen.getByText(COPY.addSpot.en);
      expect(enSpan).toHaveClass("text-stone-deep");
      expect(enSpan).not.toHaveClass("text-current");
    });

    it("tone='inherit' makes the English span text-current with reduced opacity", () => {
      render(<Bilingual k="addSpot" tone="inherit" />);

      const enSpan = screen.getByText(COPY.addSpot.en);
      expect(enSpan).toHaveClass("text-current");
      expect(enSpan).toHaveClass("opacity-75");
      expect(enSpan).not.toHaveClass("text-stone-deep");
    });
  });

  describe("layout prop", () => {
    it("defaults to 'inline': neither span is a block, and there is no forced line break between them", () => {
      render(<Bilingual k="confirmVisit" />);

      const cvSpan = screen.getByText(COPY.confirmVisit.cv);
      const enSpan = screen.getByText(COPY.confirmVisit.en);
      expect(cvSpan).not.toHaveClass("block");
      expect(enSpan).not.toHaveClass("block");
    });

    it("layout='stack' renders both spans as blocks, primary whitespace-nowrap, English small and tight-leading", () => {
      render(<Bilingual k="confirmVisit" layout="stack" />);

      const cvSpan = screen.getByText(COPY.confirmVisit.cv);
      const enSpan = screen.getByText(COPY.confirmVisit.en);
      expect(cvSpan).toHaveClass("block");
      expect(cvSpan).toHaveClass("whitespace-nowrap");
      expect(enSpan).toHaveClass("block");
      expect(enSpan).toHaveClass("text-[11px]");
      expect(enSpan).toHaveClass("leading-tight");
    });

    it("tone and layout compose: layout='stack' with tone='inherit' keeps the inherit tone classes on the English span", () => {
      render(<Bilingual k="confirmVisit" layout="stack" tone="inherit" />);

      const enSpan = screen.getByText(COPY.confirmVisit.en);
      expect(enSpan).toHaveClass("block");
      expect(enSpan).toHaveClass("text-current");
      expect(enSpan).toHaveClass("opacity-75");
    });
  });
});

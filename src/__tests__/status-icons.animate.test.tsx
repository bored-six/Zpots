import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CheckIcon } from "@/components/icons/status-icons";

/**
 * paseo-motion Wave 2.3 (.claude/prds/paseo-motion.md). `.paseo-mark`
 * drives the stroke-dasharray draw-on defined in globals.css. CheckIcon
 * is reused for the confirm CTA button (never animated) and the confirmed
 * badge (animated), so the draw-on has to be opt-in per instance rather
 * than always-on -- otherwise the CTA's static checkmark would start
 * drawing itself on every render too.
 */
describe("CheckIcon animate opt-in", () => {
  it("does not add .paseo-mark to the path by default", () => {
    const { container } = render(<CheckIcon />);
    expect(container.querySelector("path.paseo-mark")).toBeNull();
  });

  it("adds .paseo-mark to the path only when animate is explicitly requested", () => {
    const { container } = render(<CheckIcon animate />);
    expect(container.querySelector("path.paseo-mark")).not.toBeNull();
  });

  it("an unrelated CheckIcon usage (no animate prop) stays static", () => {
    const { container } = render(<CheckIcon size={20} />);
    const path = container.querySelector("path");
    expect(path?.getAttribute("class") ?? "").not.toMatch(/paseo-mark/);
  });
});

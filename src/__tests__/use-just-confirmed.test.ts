import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { useJustConfirmed } from "@/lib/use-just-confirmed";

/**
 * paseo-motion.md fix-round-2, finding 1's shared "did this just transition"
 * signal. Tested through a tiny host component (no `renderHook` dependency
 * in this repo) that surfaces the hook's return value as text, so the
 * contract -- not any particular consumer's markup -- is what's covered.
 */
function Host({ confirmed }: { confirmed: boolean }) {
  const justConfirmed = useJustConfirmed(confirmed);
  return createElement("span", { "data-testid": "result" }, String(justConfirmed));
}

describe("useJustConfirmed", () => {
  it("is false on a fresh mount that is already confirmed", () => {
    const { getByTestId } = render(createElement(Host, { confirmed: true }));
    expect(getByTestId("result").textContent).toBe("false");
  });

  it("is false on a fresh mount that is not confirmed", () => {
    const { getByTestId } = render(createElement(Host, { confirmed: false }));
    expect(getByTestId("result").textContent).toBe("false");
  });

  it("becomes true exactly when confirmed flips from false to true while mounted", () => {
    const { getByTestId, rerender } = render(createElement(Host, { confirmed: false }));
    expect(getByTestId("result").textContent).toBe("false");

    rerender(createElement(Host, { confirmed: true }));
    expect(getByTestId("result").textContent).toBe("true");
  });

  it("stays true on further re-renders once it has fired, without re-arming", () => {
    const { getByTestId, rerender } = render(createElement(Host, { confirmed: false }));

    rerender(createElement(Host, { confirmed: true }));
    expect(getByTestId("result").textContent).toBe("true");

    rerender(createElement(Host, { confirmed: true }));
    expect(getByTestId("result").textContent).toBe("true");
  });

  it("does not replay on a fresh mount even if the same spot is already confirmed (simulates remount)", () => {
    const first = render(createElement(Host, { confirmed: false }));
    first.rerender(createElement(Host, { confirmed: true }));
    expect(first.getByTestId("result").textContent).toBe("true");
    first.unmount();

    const second = render(createElement(Host, { confirmed: true }));
    expect(second.getByTestId("result").textContent).toBe("false");
  });
});

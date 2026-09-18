import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

function Smoke() {
  return <p>harness ok</p>;
}

describe("test harness smoke test", () => {
  it("renders a trivial component and finds it in the DOM", () => {
    render(<Smoke />);
    expect(screen.getByText("harness ok")).toBeInTheDocument();
  });
});

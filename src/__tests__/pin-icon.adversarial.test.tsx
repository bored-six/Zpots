import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ConfirmedPin, UnconfirmedPin } from "@/components/icons/pin-icons";
import { createPinIcon } from "@/lib/pin-icon";

/**
 * Adversarial pass on the pin redesign (spec Task 3). The frozen
 * pin-icon.test.ts already asserts on createPinIcon's DivIcon options.
 * This file renders the raw components directly (no divIcon wrapper) to
 * catch React-level warnings the wrapper's snapshot-free assertions can't
 * see, and adds the mutual-exclusivity / default-size checks the spec
 * calls out by name.
 */

describe("adversarial", () => {
  describe("renderToStaticMarkup with no React warnings", () => {
    it("UnconfirmedPin renders with zero console.error calls", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      renderToStaticMarkup(createElement(UnconfirmedPin));
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it("ConfirmedPin renders with zero console.error calls", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      renderToStaticMarkup(createElement(ConfirmedPin));
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it("both pins render with zero console.error calls when passed the props createPinIcon actually uses (size + style.color)", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      renderToStaticMarkup(createElement(UnconfirmedPin, { size: 22, style: { color: "#7a6448" } }));
      renderToStaticMarkup(createElement(ConfirmedPin, { size: 22, style: { color: "#1f6f78" } }));
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe("no stroke=\"white\" in the raw component markup (not just createPinIcon's wrapped html)", () => {
    it("UnconfirmedPin", () => {
      const html = renderToStaticMarkup(createElement(UnconfirmedPin));
      expect(html).not.toContain('stroke="white"');
    });

    it("ConfirmedPin", () => {
      const html = renderToStaticMarkup(createElement(ConfirmedPin));
      expect(html).not.toContain('stroke="white"');
    });
  });

  describe("default size is 22 when the component is rendered bare (no size prop)", () => {
    it("UnconfirmedPin defaults width/height to 22", () => {
      const html = renderToStaticMarkup(createElement(UnconfirmedPin));
      expect(html).toContain('width="22"');
      expect(html).toContain('height="22"');
    });

    it("ConfirmedPin defaults width/height to 22", () => {
      const html = renderToStaticMarkup(createElement(ConfirmedPin));
      expect(html).toContain('width="22"');
      expect(html).toContain('height="22"');
    });
  });

  describe("zpots-pin-icon--<status> classes are mutually exclusive", () => {
    it("the confirmed icon's className never contains the unconfirmed modifier", () => {
      const className = String(createPinIcon("confirmed").options.className ?? "");
      expect(className).toMatch(/\bzpots-pin-icon--confirmed\b/);
      expect(className).not.toMatch(/\bzpots-pin-icon--unconfirmed\b/);
    });

    it("the unconfirmed icon's className never contains the confirmed modifier", () => {
      const className = String(createPinIcon("unconfirmed").options.className ?? "");
      expect(className).toMatch(/\bzpots-pin-icon--unconfirmed\b/);
      expect(className).not.toMatch(/\bzpots-pin-icon--confirmed\b/);
    });
  });
});

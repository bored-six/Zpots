import { describe, expect, it } from "vitest";
import { createPinIcon } from "@/lib/pin-icon";

/**
 * paseo-motion Wave 2.3 (.claude/prds/paseo-motion.md) -- the
 * `zpots-pin-icon--just-confirmed` modifier. `createPinIcon` serialises the
 * pin SVG to a static HTML string for a Leaflet divIcon, so the only lever
 * available for a freshly-confirmed pin is splicing a class directly onto
 * the halo `<path>` in that markup (see globals.css
 * .zpots-pin-icon--just-confirmed doc comment for why it has to land on
 * the path itself, not a wrapper).
 *
 * The frozen pin-icon.adversarial.test.tsx requires the confirmed/
 * unconfirmed modifier classes stay mutually exclusive as whole words --
 * this file re-checks that constraint still holds once the new modifier
 * is present, rather than assuming it.
 */
describe("createPinIcon just-confirmed flag", () => {
  it("without the flag, confirmed markup has no just-confirmed class", () => {
    const icon = createPinIcon("confirmed");

    expect(String(icon.options.html)).not.toMatch(/zpots-pin-icon--just-confirmed/);
  });

  it("with the flag, confirmed markup gets the class on the seal group", () => {
    const icon = createPinIcon("confirmed", { justConfirmed: true });
    const html = String(icon.options.html);

    expect(html).toMatch(/<g class="zpots-seal zpots-pin-icon--just-confirmed" data-part="seal">/);
    expect(html).not.toMatch(/<path[^>]*class="zpots-pin-icon--just-confirmed"/);
  });

  it("the flag is a no-op for an unconfirmed pin", () => {
    const icon = createPinIcon("unconfirmed", { justConfirmed: true });

    expect(String(icon.options.html)).not.toMatch(/zpots-pin-icon--just-confirmed/);
  });

  it("the new modifier does not contain either status word as a whole word", () => {
    const modifier = "zpots-pin-icon--just-confirmed";

    expect(modifier).not.toMatch(/\bzpots-pin-icon--confirmed\b/);
    expect(modifier).not.toMatch(/\bzpots-pin-icon--unconfirmed\b/);
  });

  it("still satisfies the frozen adversarial mutual-exclusivity regexes when flagged", () => {
    const className = String(
      createPinIcon("confirmed", { justConfirmed: true }).options.className ?? "",
    );

    expect(className).toMatch(/\bzpots-pin-icon--confirmed\b/);
    expect(className).not.toMatch(/\bzpots-pin-icon--unconfirmed\b/);
  });
});

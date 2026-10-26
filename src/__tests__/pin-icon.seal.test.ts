import { describe, expect, it } from "vitest";
import { createPinIcon } from "@/lib/pin-icon";

/**
 * grabado-pins spec, section 10.5, revised by section 14.10 for revision 2
 * (no photo on any pin; the seal now also renders at size 16).
 *
 * THIS FILE IS EXPECTED TO FAIL RED against the revision-1 implementation:
 * size 16 is still closed-only, so the new size-16 seal test fails.
 */
describe("createPinIcon -- seal", () => {
  it("confirmed markup carries the seal; unconfirmed never does", () => {
    const confirmedHtml = String(createPinIcon("confirmed").options.html);
    const unconfirmedHtml = String(createPinIcon("unconfirmed").options.html);
    expect(confirmedHtml).toContain('data-part="seal"');
    expect(unconfirmedHtml).not.toContain('data-part="seal"');
  });

  it("the seal ring and teeth match the exact geometry from section 4.3", () => {
    const html = String(createPinIcon("confirmed").options.html);
    expect(html).toContain('r="8.5"');
    expect(html).toContain('stroke="#1f6f78"');
    expect(html).toContain('stroke-width="1.4"');
    expect(html).toContain("M24.89,17.41");
  });

  it("justConfirmed on a confirmed pin presses the seal and adds the pulse circle", () => {
    const html = String(createPinIcon("confirmed", { justConfirmed: true }).options.html);
    expect(html).toMatch(/<g class="zpots-seal zpots-pin-icon--just-confirmed" data-part="seal">/);
    expect(html).toContain('class="zpots-seal-pulse"');
    expect(html).toContain('r="9.5"');
  });

  it("without the flag the seal has no pulse", () => {
    const html = String(createPinIcon("confirmed").options.html);
    expect(html).toMatch(/<g class="zpots-seal" data-part="seal">/);
    expect(html).not.toContain("zpots-seal-pulse");
    expect(html).not.toContain("stroke-dasharray");
  });

  it("the just-confirmed classes never appear for an unconfirmed pin or a punto", () => {
    const unconfirmedHtml = String(
      createPinIcon("unconfirmed", { justConfirmed: true }).options.html,
    );
    expect(unconfirmedHtml).not.toContain("zpots-pin-icon--just-confirmed");
    expect(unconfirmedHtml).not.toContain("zpots-seal-pulse");

    const puntoHtml = String(
      createPinIcon("confirmed", { size: 10, justConfirmed: true }).options.html,
    );
    expect(puntoHtml).not.toContain("zpots-pin-icon--just-confirmed");
    expect(puntoHtml).not.toContain("zpots-seal-pulse");
  });

  it("size 16 confirmed + justConfirmed presses the seal, same as every other glyph-eligible size", () => {
    const html = String(
      createPinIcon("confirmed", { size: 16, justConfirmed: true }).options.html,
    );
    expect(html).toMatch(/<g class="zpots-seal zpots-pin-icon--just-confirmed" data-part="seal">/);
  });
});

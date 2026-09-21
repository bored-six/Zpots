import { describe, expect, it } from "vitest";
import { createPhotoPinIcon, createPinIcon } from "@/lib/pin-icon";

/**
 * grabado-pins spec, section 10.5 -- the confirmed-only seal ring (section
 * 4.3) and its just-confirmed press/pulse (section 4.7).
 *
 * THIS FILE IS EXPECTED TO FAIL RED: no seal markup exists yet anywhere in
 * `pin-icon.ts`'s output, and `justConfirmed` still splices its class onto
 * the halo `<path>` instead of the seal `<g>`. One sub-assertion (the
 * unconfirmed no-op case) is already true today on its own -- it's folded
 * into a test with the punto no-op case, which does fail today, so the
 * whole test is genuinely red.
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

  it("a confirmed photo pin also gets the just-confirmed class when flagged", () => {
    const html = String(
      createPhotoPinIcon("https://example.com/p.jpg", "confirmed", { justConfirmed: true })
        .options.html,
    );
    expect(html).toContain("zpots-pin-icon--just-confirmed");
  });
});

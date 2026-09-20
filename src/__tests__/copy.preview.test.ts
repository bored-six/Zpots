import { describe, expect, it } from "vitest";

import { COPY } from "@/lib/copy";

describe("COPY -- preview spots", () => {
  it("has 'preview' (a short pill label) and 'previewHint' (the explanatory strip), both translated", () => {
    expect(COPY.preview.en).toBe("Preview");
    expect(COPY.preview.cv.trim().length).toBeGreaterThan(0);
    expect(COPY.preview.cv).not.toBe(COPY.preview.en);

    expect(COPY.previewHint.en).toMatch(/famous/i);
    expect(COPY.previewHint.cv.trim().length).toBeGreaterThan(0);
    expect(COPY.previewHint.cv).not.toBe(COPY.previewHint.en);
  });
});

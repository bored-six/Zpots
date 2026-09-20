import { describe, expect, it } from "vitest";
import {
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_NICKNAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  REPORT_REASONS,
  isValidEmail,
  isValidReportReason,
  validateCredentials,
  validateNewSpot,
  type NewSpotInput,
} from "@/lib/validation";

const TEN_MB = 10 * 1024 * 1024;

function makeFile({
  sizeBytes = 1024,
  type = "image/jpeg",
  name = "photo.jpg",
}: { sizeBytes?: number; type?: string; name?: string } = {}): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

function validInput(overrides: Partial<NewSpotInput> = {}): NewSpotInput {
  return {
    name: "Fort Pilar",
    note: "Historic fort by the water, nice at sunset.",
    lat: 6.9098,
    lng: 122.079,
    photoFile: makeFile(),
    ...overrides,
  };
}

describe("validation constants", () => {
  it("exposes the exact length limits the brief specifies", () => {
    expect(MAX_NAME_LENGTH).toBe(80);
    expect(MAX_NOTE_LENGTH).toBe(280);
    expect(MAX_NICKNAME_LENGTH).toBe(40);
  });

  it("exposes exactly the three report reasons from the brief, no more no less", () => {
    expect([...REPORT_REASONS].sort()).toEqual(
      ["closed", "spam", "wrong_info"].sort(),
    );
  });
});

describe("validateNewSpot - happy path", () => {
  it("accepts a fully valid input", () => {
    const result = validateNewSpot(validInput());
    expect(result.valid).toBe(true);
  });
});

describe("validateNewSpot - name", () => {
  it("rejects an empty name", () => {
    const result = validateNewSpot(validInput({ name: "" }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toHaveProperty("name");
  });

  it("rejects a whitespace-only name", () => {
    const result = validateNewSpot(validInput({ name: "    " }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toHaveProperty("name");
  });

  it("rejects a name made only of unicode non-breaking spaces (not just ASCII spaces)", () => {
    // Not explicitly listed in the brief -- a naive `str.length === 0` check
    // after a homemade trim regex could miss this, since JS String#trim()
    // does treat   as whitespace but a hand-rolled implementation might not.
    const result = validateNewSpot(validInput({ name: "   " }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toHaveProperty("name");
  });

  it("accepts a name at exactly MAX_NAME_LENGTH characters (boundary)", () => {
    const result = validateNewSpot(validInput({ name: "a".repeat(MAX_NAME_LENGTH) }));
    expect(result.valid).toBe(true);
  });

  it("rejects a name one character past MAX_NAME_LENGTH", () => {
    const result = validateNewSpot(validInput({ name: "a".repeat(MAX_NAME_LENGTH + 1) }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toHaveProperty("name");
  });
});

describe("validateNewSpot - note", () => {
  it("rejects an empty note", () => {
    const result = validateNewSpot(validInput({ note: "" }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toHaveProperty("note");
  });

  it("rejects a whitespace-only note", () => {
    const result = validateNewSpot(validInput({ note: "   \t  " }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toHaveProperty("note");
  });

  it("accepts a note at exactly MAX_NOTE_LENGTH characters (boundary)", () => {
    const result = validateNewSpot(validInput({ note: "n".repeat(MAX_NOTE_LENGTH) }));
    expect(result.valid).toBe(true);
  });

  it("rejects a note at MAX_NOTE_LENGTH + 1 characters", () => {
    const result = validateNewSpot(validInput({ note: "n".repeat(MAX_NOTE_LENGTH + 1) }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toHaveProperty("note");
  });
});

describe("validateNewSpot - nickname (optional)", () => {
  it("accepts a missing nickname", () => {
    const result = validateNewSpot(validInput({ nickname: undefined }));
    expect(result.valid).toBe(true);
  });

  it("accepts an empty-string nickname (present but blank is fine -- it's optional, not required-if-present)", () => {
    const result = validateNewSpot(validInput({ nickname: "" }));
    expect(result.valid).toBe(true);
  });

  it("accepts a nickname at exactly MAX_NICKNAME_LENGTH characters (boundary)", () => {
    const result = validateNewSpot(validInput({ nickname: "n".repeat(MAX_NICKNAME_LENGTH) }));
    expect(result.valid).toBe(true);
  });

  it("rejects a nickname one character past MAX_NICKNAME_LENGTH", () => {
    const result = validateNewSpot(validInput({ nickname: "n".repeat(MAX_NICKNAME_LENGTH + 1) }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toHaveProperty("nickname");
  });
});

describe("validateNewSpot - lat/lng bounds", () => {
  // lat 90 / -90 and lng 180 / -180 are still inclusive range boundaries
  // (that intent is preserved: they must NOT get the -90..90 / -180..180
  // range error), but every one of them is geographically outside
  // Zamboanga City, so with the redesign's city restriction in place they
  // must now come back invalid with the city-only message instead of valid.
  it("lat at the exact boundary of 90 is inside the -90..90 range but outside Zamboanga City -- city error, not range error", () => {
    const result = validateNewSpot(validInput({ lat: 90 }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.lat).toBe("Pins can only be placed inside Zamboanga City.");
      expect(result.errors.lat).not.toBe("Latitude must be between -90 and 90.");
    }
  });

  it("lat at the exact boundary of -90 is inside the -90..90 range but outside Zamboanga City -- city error, not range error", () => {
    const result = validateNewSpot(validInput({ lat: -90 }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.lat).toBe("Pins can only be placed inside Zamboanga City.");
      expect(result.errors.lat).not.toBe("Latitude must be between -90 and 90.");
    }
  });

  it("rejects lat just past 90", () => {
    const result = validateNewSpot(validInput({ lat: 90.0001 }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toHaveProperty("lat");
  });

  it("rejects lat just past -90", () => {
    const result = validateNewSpot(validInput({ lat: -90.0001 }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toHaveProperty("lat");
  });

  // Same reasoning as the lat 90/-90 cases above: lng 180 / -180 are still
  // inclusive range boundaries, but they're outside Zamboanga City, so the
  // redesign flips them from valid to invalid-with-the-city-message.
  it("lng at the exact boundary of 180 is inside the -180..180 range but outside Zamboanga City -- city error, not range error", () => {
    const result = validateNewSpot(validInput({ lng: 180 }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.lng).toBe("Pins can only be placed inside Zamboanga City.");
      expect(result.errors.lng).not.toBe("Longitude must be between -180 and 180.");
    }
  });

  it("lng at the exact boundary of -180 is inside the -180..180 range but outside Zamboanga City -- city error, not range error", () => {
    const result = validateNewSpot(validInput({ lng: -180 }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.lng).toBe("Pins can only be placed inside Zamboanga City.");
      expect(result.errors.lng).not.toBe("Longitude must be between -180 and 180.");
    }
  });

  it("rejects lng just past 180", () => {
    const result = validateNewSpot(validInput({ lng: 180.0001 }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toHaveProperty("lng");
  });

  it("rejects lng just past -180", () => {
    const result = validateNewSpot(validInput({ lng: -180.0001 }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toHaveProperty("lng");
  });

  it("rejects a NaN lat (not explicitly listed, but a malformed-input case a number input can actually produce)", () => {
    const result = validateNewSpot(validInput({ lat: Number.NaN }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toHaveProperty("lat");
  });
});

describe("validateNewSpot - Zamboanga City restriction (redesign)", () => {
  it("accepts coordinates inside Zamboanga City (Fort Pilar, the default validInput() location)", () => {
    const result = validateNewSpot(validInput());
    expect(result.valid).toBe(true);
  });

  it("rejects Manila's coordinates with the city-only error on both lat and lng, even though they pass the -90..90 / -180..180 range checks", () => {
    const result = validateNewSpot(validInput({ lat: 14.6, lng: 120.98 }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.lat).toBe("Pins can only be placed inside Zamboanga City.");
      expect(result.errors.lng).toBe("Pins can only be placed inside Zamboanga City.");
    }
  });

  it("a lat of 200 (out of the -90..90 range) still yields the range error, not the city error", () => {
    const result = validateNewSpot(validInput({ lat: 200 }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.lat).toBe("Latitude must be between -90 and 90.");
      expect(result.errors.lat).not.toMatch(/zamboanga city/i);
    }
  });
});

describe("validateNewSpot - photo", () => {
  it("rejects a null photoFile (photo is required per the brief)", () => {
    const result = validateNewSpot(validInput({ photoFile: null }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toHaveProperty("photoFile");
  });

  it("rejects a non-image mime type", () => {
    const result = validateNewSpot(
      validInput({ photoFile: makeFile({ type: "text/plain", sizeBytes: 1024 }) }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toHaveProperty("photoFile");
  });

  it("accepts an image file one byte under the 10MB boundary", () => {
    const result = validateNewSpot(
      validInput({ photoFile: makeFile({ type: "image/png", sizeBytes: TEN_MB - 1 }) }),
    );
    expect(result.valid).toBe(true);
  });

  it("rejects an image file at exactly the 10MB boundary ('under 10MB' means strictly less than)", () => {
    const result = validateNewSpot(
      validInput({ photoFile: makeFile({ type: "image/png", sizeBytes: TEN_MB }) }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveProperty("photoFile");
      expect(result.errors.photoFile).toBe("Photo must be under 10MB.");
    }
  });

  it("rejects an image file over the 10MB boundary", () => {
    const result = validateNewSpot(
      validInput({ photoFile: makeFile({ type: "image/png", sizeBytes: TEN_MB + 1 }) }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toHaveProperty("photoFile");
  });
});

describe("validateNewSpot - multiple simultaneous errors", () => {
  it("reports errors for every invalid field at once, not just the first one found", () => {
    const result = validateNewSpot({
      name: "",
      note: "",
      lat: 999,
      lng: -999,
      nickname: "n".repeat(MAX_NICKNAME_LENGTH + 1),
      photoFile: null,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveProperty("name");
      expect(result.errors).toHaveProperty("note");
      expect(result.errors).toHaveProperty("lat");
      expect(result.errors).toHaveProperty("lng");
      expect(result.errors).toHaveProperty("nickname");
      expect(result.errors).toHaveProperty("photoFile");
    }
  });
});

describe("isValidReportReason", () => {
  it.each(REPORT_REASONS)("accepts '%s' exactly as listed", (reason) => {
    expect(isValidReportReason(reason)).toBe(true);
  });

  it("rejects a reason not in REPORT_REASONS", () => {
    expect(isValidReportReason("not_a_real_reason")).toBe(false);
  });

  it("rejects a valid reason with different casing ('Spam' vs 'spam')", () => {
    expect(isValidReportReason("Spam")).toBe(false);
    expect(isValidReportReason("SPAM")).toBe(false);
  });

  it("rejects a valid reason with extra surrounding whitespace", () => {
    expect(isValidReportReason(" spam")).toBe(false);
    expect(isValidReportReason("spam ")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidReportReason("")).toBe(false);
  });
});

describe("MIN_PASSWORD_LENGTH", () => {
  it("is 8, matching the dashboard's minimum password length setting", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });
});

describe("isValidEmail", () => {
  it.each(["a@b.co", "A@B.CO", "foo.bar@example.com", "  a@b.co  "])(
    "accepts '%s'",
    (value) => {
      expect(isValidEmail(value)).toBe(true);
    },
  );

  it.each(["", "   ", "a", "a@", "@b.co", "a@b", "a b@c.co"])("rejects '%s'", (value) => {
    expect(isValidEmail(value)).toBe(false);
  });
});

describe("validateCredentials", () => {
  it("sign-in mode does not enforce MIN_PASSWORD_LENGTH", () => {
    const result = validateCredentials("a@b.com", "short", "signin");
    expect(result.valid).toBe(true);
  });

  it("sign-in mode rejects an empty email or password", () => {
    const emptyEmail = validateCredentials("", "password1", "signin");
    expect(emptyEmail.valid).toBe(false);
    if (!emptyEmail.valid) expect(emptyEmail.errors).toHaveProperty("email");

    const emptyPassword = validateCredentials("a@b.com", "", "signin");
    expect(emptyPassword.valid).toBe(false);
    if (!emptyPassword.valid) expect(emptyPassword.errors).toHaveProperty("password");
  });

  it("sign-up mode enforces MIN_PASSWORD_LENGTH", () => {
    const result = validateCredentials("a@b.com", "short", "signup");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toHaveProperty("password");
  });

  it("sign-up mode accepts a password at exactly MIN_PASSWORD_LENGTH", () => {
    const result = validateCredentials("a@b.com", "a".repeat(MIN_PASSWORD_LENGTH), "signup");
    expect(result.valid).toBe(true);
  });

  it("sign-up mode rejects an invalid email shape", () => {
    const result = validateCredentials("not-an-email", "password1", "signup");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toHaveProperty("email");
  });

  it("reports all errors at once", () => {
    const result = validateCredentials("bad-email", "short", "signup");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveProperty("email");
      expect(result.errors).toHaveProperty("password");
    }
  });

  it("passes a password with surrounding spaces through untrimmed (never validated as empty due to trimming)", () => {
    const result = validateCredentials("a@b.com", "        ", "signup");
    // 8 spaces meets the length requirement -- MIN_PASSWORD_LENGTH counts
    // characters, not trimmed content; the password itself is never trimmed.
    expect(result.valid).toBe(true);
  });
});

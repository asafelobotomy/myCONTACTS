import { describe, expect, it } from "vitest";
import { humanDisplayName, looksLikePhone } from "./contact-name";
import { contactPersonName, createContact } from "./contact-utils";

describe("contact name detection", () => {
  it("detects formatted international numbers as phone-like", () => {
    expect(looksLikePhone("+90 530 309 35 88")).toBe(true);
    expect(humanDisplayName("+90 530 309 35 88")).toBeUndefined();
  });

  it("keeps real names", () => {
    expect(humanDisplayName("Aaron Flynn")).toBe("Aaron Flynn");
    expect(humanDisplayName("--••-")).toBe("--••-");
    expect(contactPersonName(
      createContact({
        source: "whatsapp",
        displayName: "Aaron Flynn",
        phones: [{ value: "+447717607249", e164: "+447717607249" }],
        confidence: "structured",
      }),
    )).toBe("Aaron Flynn");
  });
});

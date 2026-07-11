import { describe, expect, it } from "vitest";
import {
  contactPhoneFromParsed,
  detectBrowserPhoneRegion,
  parseRegionAwarePhone,
  resolvePhoneRegion,
} from "./phone-region";

describe("region-aware phone parsing", () => {
  it("parses international numbers using their own country code", () => {
    const turkish = parseRegionAwarePhone("+90 530 309 35 88", { defaultCountry: "IE" });
    const irish = parseRegionAwarePhone("+353 85 135 4919", { defaultCountry: "US" });
    const uk = parseRegionAwarePhone("+44 7716 198204", { defaultCountry: "IE" });

    expect(turkish?.country).toBe("TR");
    expect(irish?.country).toBe("IE");
    expect(uk?.country).toBe("GB");
  });

  it("parses WhatsApp-style bare international digits without a default region bias", () => {
    const parsed = parseRegionAwarePhone("905303093588", { defaultCountry: "IE" });
    expect(parsed?.country).toBe("TR");
    expect(contactPhoneFromParsed(parsed!).e164).toBe("+905303093588");
  });

  it("uses the default region only for local numbers without a country code", () => {
    const irishLocal = parseRegionAwarePhone("085 113 6169", { defaultCountry: "IE" });
    const usLocal = parseRegionAwarePhone("(415) 555-0100", { defaultCountry: "US" });

    expect(irishLocal?.country).toBe("IE");
    expect(usLocal?.country).toBe("US");
  });

  it("does not reinterpret foreign local numbers with the wrong default region", () => {
    expect(parseRegionAwarePhone("(415) 555-0100", { defaultCountry: "IE" })).toBeUndefined();
    expect(parseRegionAwarePhone("085 113 6169", { defaultCountry: "US" })).toBeUndefined();
  });

  it("rejects invalid or overlong numbers", () => {
    expect(parseRegionAwarePhone("+161642024633962666015835872849190")).toBeUndefined();
    expect(parseRegionAwarePhone("12345", { defaultCountry: "IE" })).toBeUndefined();
  });

  it("resolves supported phone regions and falls back for invalid values", () => {
    expect(resolvePhoneRegion("IE")).toBe("IE");
    expect(resolvePhoneRegion("invalid")).toBe(detectBrowserPhoneRegion());
  });
});

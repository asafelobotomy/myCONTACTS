import { describe, expect, it } from "vitest";
import {
  buildGoogleCsvHeaders,
  googlePhoneLabel,
  resolveExportNameFields,
  toVcardTimestamp,
} from "./export-standards";
import type { Contact } from "./types";

describe("export standards", () => {
  it("uses Google Contacts CSV headers", () => {
    expect(buildGoogleCsvHeaders(1, 1, 1)).toEqual([
      "First Name",
      "Middle Name",
      "Last Name",
      "Phonetic First Name",
      "Phonetic Middle Name",
      "Phonetic Last Name",
      "Name Prefix",
      "Name Suffix",
      "Nickname",
      "File As",
      "Organization Name",
      "Organization Title",
      "Organization Department",
      "Birthday",
      "Notes",
      "Photo",
      "Labels",
      "E-mail 1 - Label",
      "E-mail 1 - Value",
      "Phone 1 - Label",
      "Phone 1 - Value",
      "Website 1 - Label",
      "Website 1 - Value",
    ]);
  });

  it("splits display names into first and last for CSV/vCard fields", () => {
    const contact: Contact = {
      id: "1",
      source: "whatsapp-web",
      displayName: "Aaron Flynn",
      extractedAt: "2026-01-01T00:00:00.000Z",
      confidence: "structured",
    };

    expect(resolveExportNameFields(contact)).toEqual({
      fileAs: "Aaron Flynn",
      givenName: "Aaron",
      familyName: "Flynn",
    });
  });

  it("maps phone types to Google labels", () => {
    expect(googlePhoneLabel({ value: "+14155550100" })).toBe("Mobile");
    expect(googlePhoneLabel({ value: "+14155550100", type: "work" })).toBe("Work");
  });

  it("formats ISO timestamps for vCard REV", () => {
    expect(toVcardTimestamp("2026-01-01T00:00:00.000Z")).toBe("20260101T000000Z");
  });
});

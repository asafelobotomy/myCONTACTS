import { describe, expect, it } from "vitest";
import { contactDedupeKey, contactDisplayName, contactPersonName, applyContactInclusionPolicy, mergeContacts } from "./contact-utils";
import { exportContacts } from "./export-service";
import { normalizeContact, normalizeEmail, normalizePhone } from "./normalizer";
import {
  parseJsonLdContacts,
  parseRegexContacts,
  parseSemanticDomContacts,
} from "./parsers/structured-parsers";
import type { Contact } from "./types";

describe("contact utils", () => {
  it("returns person names without phone fallback", () => {
    const contact: Contact = {
      id: "1",
      source: "whatsapp",
      phones: [{ value: "+90 530 309 35 88", e164: "+905303093588" }],
      extractedAt: "2026-01-01T00:00:00.000Z",
      confidence: "structured",
    };

    expect(contactPersonName(contact)).toBeUndefined();
    expect(contactDisplayName(contact)).toBe("+90 530 309 35 88");
  });

  it("excludes phone-only entries unless unnamed inclusion is enabled", () => {
    const named: Contact = {
      id: "1",
      source: "whatsapp",
      displayName: "--••-",
      phones: [{ value: "+353877553716", e164: "+353877553716" }],
      extractedAt: "2026-01-01T00:00:00.000Z",
      confidence: "structured",
    };
    const unnamed: Contact = {
      id: "2",
      source: "whatsapp",
      phones: [{ value: "+353830828392", e164: "+353830828392" }],
      extractedAt: "2026-01-01T00:00:00.000Z",
      confidence: "structured",
    };

    expect(applyContactInclusionPolicy([named, unnamed], false)).toEqual([named]);
    expect(applyContactInclusionPolicy([named, unnamed], true)).toEqual([named, unnamed]);
  });

  it("merges contacts by phone", () => {
    const existing: Contact[] = [
      {
        id: "1",
        source: "generic",
        displayName: "Ada",
        phones: [{ value: "+1 415 555 0100", e164: "+14155550100" }],
        extractedAt: "2026-01-01T00:00:00.000Z",
        confidence: "dom",
      },
    ];
    const incoming: Contact[] = [
      {
        id: "2",
        source: "generic",
        displayName: "Ada Lovelace",
        emails: [{ value: "ada@example.com" }],
        phones: [{ value: "+14155550100", e164: "+14155550100" }],
        extractedAt: "2026-01-02T00:00:00.000Z",
        confidence: "structured",
      },
    ];

    const merged = mergeContacts(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(contactDisplayName(merged[0]!)).toBe("Ada Lovelace");
    expect(merged[0]?.emails?.[0]?.value).toBe("ada@example.com");
  });

  it("creates stable dedupe keys", () => {
    const contact: Contact = {
      id: "1",
      source: "whatsapp",
      displayName: "Test",
      phones: [{ value: "+14155550100", e164: "+14155550100" }],
      extractedAt: "2026-01-01T00:00:00.000Z",
      confidence: "dom",
    };
    expect(contactDedupeKey(contact)).toBe("phone:14155550100");
  });
});

describe("normalizer", () => {
  it("normalizes valid phone numbers", () => {
    const phone = normalizePhone("+1 (415) 555-0100", { defaultCountry: "US" });
    expect(phone?.e164).toBe("+14155550100");
  });

  it("normalizes emails", () => {
    expect(normalizeEmail(" Ada@Example.com ")).toEqual({ value: "ada@example.com" });
  });

  it("normalizes contact records", () => {
    const contact = normalizeContact({
      id: "1",
      source: "generic",
      displayName: " Ada ",
      phones: [{ value: "4155550100" }],
      extractedAt: "2026-01-01T00:00:00.000Z",
      confidence: "regex",
    }, "US");
    expect(contact.displayName).toBe("Ada");
    expect(contact.phones?.[0]?.e164).toBe("+14155550100");
  });
});

describe("structured parsers", () => {
  it("parses JSON-LD Person nodes", () => {
    document.body.innerHTML = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Person",
          "name": "Grace Hopper",
          "email": "grace@example.com",
          "telephone": "+1-415-555-0101",
          "jobTitle": "Engineer"
        }
      </script>
    `;

    const contacts = parseJsonLdContacts(document, "https://example.com/team");
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.displayName).toBe("Grace Hopper");
    expect(contacts[0]?.emails?.[0]?.value).toBe("grace@example.com");
  });

  it("parses semantic mailto and tel links", () => {
    document.body.innerHTML = `
      <article>
        <h2>Support</h2>
        <a href="mailto:support@example.com">Email us</a>
        <a href="tel:+14155550102">Call us</a>
      </article>
    `;

    const contacts = parseSemanticDomContacts(document, "https://example.com/contact");
    expect(contacts.length).toBeGreaterThanOrEqual(2);
  });

  it("parses regex fallback contacts from page text", () => {
    document.body.innerHTML = `<main>Reach us at sales@example.com or +1 415 555 0103.</main>`;
    const contacts = parseRegexContacts(document, "https://example.com");
    expect(contacts.some((contact) => contact.emails?.[0]?.value === "sales@example.com")).toBe(true);
    expect(contacts.some((contact) => contact.phones?.length)).toBe(true);
  });
});

describe("export service", () => {
  const sample: Contact[] = [
    {
      id: "contact-1",
      source: "generic",
      displayName: "Export Test",
      phones: [{ value: "+14155550104", e164: "+14155550104" }],
      emails: [{ value: "export@example.com" }],
      extractedAt: "2026-01-01T00:00:00.000Z",
      confidence: "structured",
    },
  ];

  it("exports CSV", () => {
    const result = exportContacts(sample, "csv");
    expect(result.mimeType).toBe("text/csv;charset=utf-8");
    expect(result.content).toContain("First Name");
    expect(result.content).toContain("Phone 1 - Value");
    expect(result.content).toContain("export@example.com");
    expect(result.content.startsWith("\uFEFF")).toBe(true);
  });

  it("exports JSON as jCard", () => {
    const result = exportContacts(sample, "json");
    expect(result.mimeType).toBe("application/vcard+json");
    const parsed = JSON.parse(result.content) as Array<[string, ...unknown[]]>;
    expect(parsed[0]?.[0]).toBe("vcard");
  });

  it("exports vCard", () => {
    const result = exportContacts(sample, "vcard");
    expect(result.mimeType).toBe("text/vcard;charset=utf-8");
    expect(result.content).toContain("BEGIN:VCARD");
    expect(result.content).toContain("VERSION:4.0");
    expect(result.content).toContain("Export Test");
    expect(result.content).toContain("REV:");
    expect(result.content).toContain("CATEGORIES:");
  });

  it("exports vCard with structured N property when names are present", () => {
    const result = exportContacts(
      [
        {
          id: "named-contact",
          source: "whatsapp-web",
          displayName: "Aaron Flynn",
          givenName: "Aaron",
          familyName: "Flynn",
          phones: [{ value: "+14155550104", e164: "+14155550104" }],
          extractedAt: "2026-01-01T00:00:00.000Z",
          confidence: "structured",
        },
      ],
      "vcard",
    );

    expect(result.content).toContain("FN:Aaron Flynn");
    expect(result.content).toContain("N:Flynn;Aaron;;;");
    expect(result.content).toContain("TEL;TYPE=cell:");
  });
});

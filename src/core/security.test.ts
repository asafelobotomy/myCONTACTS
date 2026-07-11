import { describe, expect, it } from "vitest";
import { decryptLibrary, encryptLibrary, generateSalt } from "./crypto";
import { csvEscape, exportContacts } from "./export-service";
import { resolveAdapter } from "./extraction-service";
import { DEFAULT_EXTRACTION_OPTIONS } from "./extraction-options";
import type { Contact } from "./types";
import { ValidationError, validateContacts } from "./validation";

describe("validation", () => {
  it("rejects oversized contact batches", () => {
    const contacts = Array.from({ length: 5001 }, (_, index) => ({
      id: `id-${index}`,
      source: "generic",
      extractedAt: "2026-01-01T00:00:00.000Z",
      confidence: "dom",
    }));

    expect(() => validateContacts(contacts)).toThrow(ValidationError);
  });

  it("accepts valid contacts", () => {
    const contacts = validateContacts([
      {
        id: "contact-1",
        source: "generic",
        extractedAt: "2026-01-01T00:00:00.000Z",
        confidence: "structured",
        displayName: "Ada Lovelace",
        emails: [{ value: "ada@example.com" }],
      },
    ]);

    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.displayName).toBe("Ada Lovelace");
  });
});

describe("csv export hardening", () => {
  it("prefixes formula-like values to prevent spreadsheet injection", () => {
    expect(csvEscape("=2+2")).toBe("'=2+2");
    expect(csvEscape("+14155550100")).toBe("'+14155550100");
  });

  it("exports sanitized csv rows", () => {
    const sample: Contact[] = [
      {
        id: "contact-1",
        source: "generic",
        displayName: "=HYPERLINK(\"http://evil.test\")",
        extractedAt: "2026-01-01T00:00:00.000Z",
        confidence: "dom",
      },
    ];

    const result = exportContacts(sample, "csv");
    expect(result.content).toContain("'=HYPERLINK");
  });
});

describe("library encryption", () => {
  it("round-trips encrypted library data", async () => {
    const contacts: Contact[] = [
      {
        id: "contact-1",
        source: "generic",
        displayName: "Encrypted User",
        extractedAt: "2026-01-01T00:00:00.000Z",
        confidence: "structured",
      },
    ];
    const salt = generateSalt();
    const encrypted = await encryptLibrary(contacts, "test-passphrase", salt);
    const decrypted = await decryptLibrary(encrypted, "test-passphrase", salt);

    expect(decrypted).toEqual(contacts);
  });
});

describe("extraction options", () => {
  it("returns null adapter when all platforms are disabled", () => {
    const adapter = resolveAdapter(new URL("https://web.whatsapp.com/"), {
      ...DEFAULT_EXTRACTION_OPTIONS,
      enabledPlatforms: {
        "whatsapp-web": false,
        "discord-web": false,
        "telegram-web": false,
        linkedin: false,
        "generic-web": false,
      },
    });

    expect(adapter).toBeNull();
  });
});

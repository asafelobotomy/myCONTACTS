import { describe, expect, it } from "vitest";
import { createContact } from "./contact-utils";
import { normalizeContact } from "./normalizer";
import {
  isExportableWhatsAppContact,
  pickBestWhatsAppDisplayName,
  rawIndexedDbContactToContact,
} from "./adapters/whatsapp-contacts";
import { consolidateRawContacts } from "./adapters/whatsapp-indexeddb";

describe("WhatsApp IndexedDB consolidation", () => {
  it("merges split name and phone records for the same jid", () => {
    const merged = consolidateRawContacts([
      { savedName: "Aaron Flynn", id: "353851354919@s.whatsapp.net" },
      { phone: "+353851354919", id: "353851354919@s.whatsapp.net" },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.savedName).toBe("Aaron Flynn");
    expect(merged[0]?.phone).toBe("+353851354919");
    expect(merged[0]?.id).toBe("353851354919@s.whatsapp.net");
  });

  it("merges alternate names from separate records", () => {
    const merged = consolidateRawContacts([
      { savedName: "Aaron Flynn", phone: "+353851354919", id: "353851354919@s.whatsapp.net" },
      { pushname: "Aaron", phone: "+353851354919" },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.savedName).toBe("Aaron Flynn");
    expect(merged[0]?.pushname).toBe("Aaron");
  });

  it("drops internal ids that are not valid phone numbers", () => {
    const merged = consolidateRawContacts([
      { phone: "+161642024633962666015835872849190" },
      { id: "161642024633962666015835872849190@s.whatsapp.net" },
    ]);

    expect(merged).toHaveLength(0);
  });

  it("drops group chats and name-only chat labels", () => {
    const merged = consolidateRawContacts([
      { savedName: "Hen Do", id: "120363123456789012@g.us" },
      { savedName: "Hen Do" },
      { savedName: "Unread" },
      { savedName: "Groups" },
    ]);

    expect(merged).toHaveLength(0);
  });

  it("does not treat phone-like strings as display names", () => {
    const merged = consolidateRawContacts([
      { pushname: "+353830136136", phone: "+353830136136" },
    ]);

    expect(merged).toHaveLength(1);
    expect(pickBestWhatsAppDisplayName(merged[0]!)).toBeUndefined();
    expect(merged[0]?.phone).toBe("+353830136136");
  });
});

describe("WhatsApp raw contact mapping", () => {
  it("maps all available fields onto Contact", () => {
    const contact = rawIndexedDbContactToContact(
      {
        savedName: "Aaron Flynn",
        pushname: "Aaron",
        verifiedName: "Aaron Flynn Business",
        phone: "+353851354919",
        id: "353851354919@s.whatsapp.net",
        email: "aaron@example.com",
        org: "Flynn Ltd",
        title: "Consulting",
        website: "https://example.com",
        status: "Available",
        photoUrl: "https://example.com/photo.jpg",
        labels: ["Work", "VIP"],
      },
      "https://web.whatsapp.com/",
    );

    expect(contact.displayName).toBe("Aaron Flynn");
    expect(contact.givenName).toBe("Aaron");
    expect(contact.familyName).toBe("Flynn");
    expect(contact.alternateNames).toEqual(["Aaron Flynn Business", "Aaron"]);
    expect(contact.phones).toEqual([{ value: "+353851354919" }]);
    expect(contact.emails).toEqual([{ value: "aaron@example.com" }]);
    expect(contact.org).toBe("Flynn Ltd");
    expect(contact.title).toBe("Consulting");
    expect(contact.urls).toEqual(["https://example.com", "https://wa.me/353851354919"]);
    expect(contact.photoUrl).toBe("https://example.com/photo.jpg");
    expect(contact.notes).toBe("Available | Labels: Work, VIP");
    expect(contact.sourceId).toBe("353851354919@s.whatsapp.net");
  });

  it("keeps symbolic names like --••-", () => {
    const contact = rawIndexedDbContactToContact(
      {
        pushname: "--••-",
        phone: "+353877553716",
        id: "353877553716@s.whatsapp.net",
      },
      "https://web.whatsapp.com/",
    );

    expect(contact.displayName).toBe("--••-");
  });
});

describe("WhatsApp contact filtering", () => {
  it("accepts individual contacts with a valid phone", () => {
    const contact = normalizeContact(
      createContact({
        source: "whatsapp",
        displayName: "Aaron Flynn",
        phones: [{ value: "+353851354919", e164: "+353851354919" }],
        confidence: "structured",
      }),
      "IE",
    );

    expect(isExportableWhatsAppContact(contact)).toBe(true);
  });

  it("rejects contacts without a phone number", () => {
    const contact = createContact({
      source: "whatsapp",
      displayName: "Blue Group",
      confidence: "structured",
    });

    expect(isExportableWhatsAppContact(contact)).toBe(false);
  });

  it("clears blocked sidebar labels from display names", () => {
    const contact = normalizeContact(
      createContact({
        source: "whatsapp",
        displayName: "Unread",
        phones: [{ value: "+353851354919", e164: "+353851354919" }],
        confidence: "structured",
      }),
      "IE",
    );

    expect(contact.displayName).toBeUndefined();
    expect(isExportableWhatsAppContact(contact)).toBe(true);
  });
});

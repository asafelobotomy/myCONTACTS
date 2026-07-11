import type { Contact, ExtractContext, SiteAdapter } from "../types";
import { mergeContacts } from "../contact-utils";
import { normalizeContact } from "../normalizer";
import { isExportableWhatsAppContact, rawIndexedDbContactToContact } from "./whatsapp-contacts";
import { readWhatsAppIndexedDbContacts } from "./whatsapp-indexeddb";

export const whatsAppAdapter: SiteAdapter = {
  id: "whatsapp-web",
  adapterVersion: "1.3.0",
  match(url: URL) {
    return url.hostname === "web.whatsapp.com";
  },
  async extract(ctx: ExtractContext): Promise<Contact[]> {
    const sourceUrl = ctx.url.href;
    const indexedDbContacts = await readWhatsAppIndexedDbContacts();
    const indexedContacts = indexedDbContacts
      .filter((entry) => entry.phone)
      .map((entry) =>
        normalizeContact(
          rawIndexedDbContactToContact(entry, sourceUrl),
          ctx.options.defaultPhoneRegion,
        ),
      );

    const merged = mergeContacts([], indexedContacts);
    return merged.filter((contact) => isExportableWhatsAppContact(contact, ctx.options.defaultPhoneRegion));
  },
};

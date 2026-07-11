import type { Contact, ExtractContext, SiteAdapter } from "../types";
import { mergeContacts } from "../contact-utils";
import { normalizeContact } from "../normalizer";
import {
  parseHCardContacts,
  parseJsonLdContacts,
  parseRegexContacts,
  parseSemanticDomContacts,
} from "../parsers/structured-parsers";

export const genericWebAdapter: SiteAdapter = {
  id: "generic-web",
  adapterVersion: "1.1.0",
  match() {
    return true;
  },
  async extract(ctx: ExtractContext): Promise<Contact[]> {
    const sourceUrl = ctx.url.href;
    const structured = [
      ...parseJsonLdContacts(ctx.document, sourceUrl),
      ...parseHCardContacts(ctx.document, sourceUrl),
      ...parseSemanticDomContacts(ctx.document, sourceUrl),
    ];

    const mergedStructured = mergeContacts([], structured);
    if (mergedStructured.length > 0) {
      return mergedStructured.map((contact) =>
        normalizeContact(contact, ctx.options.defaultPhoneRegion),
      );
    }

    if (!ctx.options.enableRegexFallback) {
      return [];
    }

    const regexContacts = parseRegexContacts(
      ctx.document,
      sourceUrl,
      "regex",
      ctx.options.maxRegexPageChars,
    );
    return regexContacts.map((contact) => normalizeContact(contact, ctx.options.defaultPhoneRegion));
  },
};

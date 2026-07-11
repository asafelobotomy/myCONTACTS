import { discordAdapter, telegramAdapter } from "./adapters/chat-adapters";
import { genericWebAdapter } from "./adapters/generic-web-adapter";
import { linkedInAdapter } from "./adapters/linkedin-adapter";
import { whatsAppAdapter } from "./adapters/whatsapp-adapter";
import type { ExtractionOptions } from "./extraction-options";
import { isPlatformEnabled } from "./extraction-options";
import type { Contact, ExtractContext, ExtractionResult, SiteAdapter } from "./types";
import { applyContactInclusionPolicy, mergeContacts } from "./contact-utils";
import { normalizeContact } from "./normalizer";

export const platformAdapters: SiteAdapter[] = [
  whatsAppAdapter,
  discordAdapter,
  telegramAdapter,
  linkedInAdapter,
];

export function resolveAdapter(url: URL, options: ExtractionOptions): SiteAdapter | null {
  const platformAdapter = platformAdapters.find(
    (adapter) => adapter.match(url) && isPlatformEnabled(options, adapter.id),
  );
  if (platformAdapter) {
    return platformAdapter;
  }

  if (isPlatformEnabled(options, "generic-web")) {
    return genericWebAdapter;
  }

  return null;
}

export async function extractContactsFromPage(
  ctx: Omit<ExtractContext, "options"> & { options: ExtractionOptions },
): Promise<ExtractionResult> {
  const adapter = resolveAdapter(ctx.url, ctx.options);
  if (!adapter) {
    return {
      adapterId: "disabled",
      adapterVersion: "0.0.0",
      contacts: [],
      warnings: ["All extractors are disabled for this site in Privacy settings."],
    };
  }

  const contacts = await adapter.extract(ctx);
  const normalized = mergeContacts(
    [],
    contacts.map((contact) => normalizeContact(contact, ctx.options.defaultPhoneRegion)),
  );
  const filtered = applyContactInclusionPolicy(normalized, ctx.options.includeUnnamedContacts);
  const excludedUnnamedCount = normalized.length - filtered.length;

  return {
    adapterId: adapter.id,
    adapterVersion: adapter.adapterVersion,
    contacts: filtered,
    warnings: buildWarnings(adapter, filtered, excludedUnnamedCount, ctx.options.includeUnnamedContacts),
  };
}

function buildWarnings(
  adapter: SiteAdapter,
  contacts: Contact[],
  excludedUnnamedCount: number,
  includeUnnamedContacts: boolean,
): string[] | undefined {
  const warnings: string[] = [];

  if (!includeUnnamedContacts && excludedUnnamedCount > 0) {
    warnings.push(
      `Excluded ${excludedUnnamedCount} phone-only entries without a saved name. Enable "Include unnamed entries" in settings to keep them.`,
    );
  }

  if (adapter.id === "linkedin") {
    warnings.push(
      "LinkedIn offers an official Connections.csv export. Use the guidance contact or Settings → Data privacy → Get a copy of your data for the most complete export.",
    );
  }

  if (adapter.id === "whatsapp-web" && contacts.length === 0) {
    warnings.push(
      "No WhatsApp contacts found in the local contact cache. Make sure WhatsApp Web is fully loaded and synced, then scan again.",
    );
  }

  return warnings.length ? warnings : undefined;
}

export {
  genericWebAdapter,
  whatsAppAdapter,
  discordAdapter,
  telegramAdapter,
  linkedInAdapter,
};

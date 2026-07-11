import type { Contact, ExtractContext, SiteAdapter } from "../types";
import { createContact } from "../contact-utils";
import { autoScrollElement, textContent, uniqueBy } from "../dom-utils";
import { normalizeContact } from "../normalizer";

export const LINKEDIN_OFFICIAL_EXPORT_URL =
  "https://www.linkedin.com/mypreferences/d/download-my-data";

export const linkedInAdapter: SiteAdapter = {
  id: "linkedin",
  adapterVersion: "1.0.0",
  match(url: URL) {
    return url.hostname.endsWith("linkedin.com");
  },
  async extract(ctx: ExtractContext): Promise<Contact[]> {
    const sourceUrl = ctx.url.href;
    const contacts: Contact[] = [];

    contacts.push(
      createContact({
        source: "linkedin",
        sourceUrl,
        displayName: "LinkedIn official export (recommended)",
        urls: [LINKEDIN_OFFICIAL_EXPORT_URL],
        confidence: "structured",
      }),
    );

    const connectionRoots = Array.from(
      ctx.document.querySelectorAll(
        ".scaffold-finite-scroll__content, .mn-connection-card, .artdeco-list, main",
      ),
    );

    for (const root of connectionRoots) {
      await autoScrollElement(root, { maxSteps: 35 });
    }

    const cards = Array.from(
      ctx.document.querySelectorAll(
        ".mn-connection-card, .discover-entity-type-card, li.reusable-search__result-container, [data-view-name='connections-list'] li",
      ),
    );

    for (const card of cards) {
      const displayName = textContent(
        card.querySelector(
          ".mn-connection-card__name, .entity-result__title-text a, span[aria-hidden='true']",
        ),
      );
      const subtitle = textContent(
        card.querySelector(".mn-connection-card__occupation, .entity-result__primary-subtitle"),
      );
      const profileUrl = card.querySelector("a[href*='/in/']")?.getAttribute("href") ?? undefined;

      if (!displayName) {
        continue;
      }

      const [title, org] = splitTitleOrg(subtitle);
      contacts.push(
        normalizeContact(
          createContact({
            source: "linkedin",
            sourceUrl,
            displayName,
            title,
            org,
            urls: profileUrl ? [absoluteUrl(profileUrl, ctx.url.origin)] : undefined,
            confidence: "dom",
          }),
          ctx.options.defaultPhoneRegion,
        ),
      );
    }

    return uniqueBy(contacts, (contact) => contact.urls?.[0] ?? contact.displayName ?? contact.id);
  },
};

function splitTitleOrg(value: string | undefined): [string | undefined, string | undefined] {
  if (!value) {
    return [undefined, undefined];
  }
  const parts = value.split(" at ");
  if (parts.length === 2) {
    return [parts[0]?.trim(), parts[1]?.trim()];
  }
  return [value.trim(), undefined];
}

function absoluteUrl(path: string, origin: string): string {
  if (path.startsWith("http")) {
    return path;
  }
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

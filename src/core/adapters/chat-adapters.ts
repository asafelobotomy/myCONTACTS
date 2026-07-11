import type { Contact, ExtractContext, SiteAdapter } from "../types";
import { createContact } from "../contact-utils";
import { autoScrollElement, textContent, uniqueBy } from "../dom-utils";
import { normalizeContact } from "../normalizer";

export const discordAdapter: SiteAdapter = {
  id: "discord-web",
  adapterVersion: "1.0.0",
  match(url: URL) {
    return url.hostname === "discord.com" || url.hostname.endsWith(".discord.com");
  },
  async extract(ctx: ExtractContext): Promise<Contact[]> {
    const sourceUrl = ctx.url.href;
    const contacts: Contact[] = [];

    const memberPanels = Array.from(
      ctx.document.querySelectorAll(
        "[class*='membersWrap'], [aria-label*='Members'], [data-list-id*='members']",
      ),
    );

    for (const panel of memberPanels) {
      await autoScrollElement(panel, { maxSteps: 30 });
      const members = Array.from(
        panel.querySelectorAll("[class*='member'], [data-list-item-id], [role='listitem']"),
      );

      for (const member of members) {
        const displayName =
          textContent(member.querySelector("[class*='username'], [class*='name'], strong, span")) ??
          member.getAttribute("aria-label");
        const role = textContent(member.querySelector("[class*='role']"));

        if (!displayName || displayName.toLowerCase() === "online" || displayName.toLowerCase() === "offline") {
          continue;
        }

        contacts.push(
          normalizeContact(
            createContact({
              source: "discord",
              sourceUrl,
              displayName,
              title: role,
              confidence: "dom",
            }),
            ctx.options.defaultPhoneRegion,
          ),
        );
      }
    }

    const profileCards = Array.from(
      ctx.document.querySelectorAll("[class*='userPopout'], [class*='profilePanel'], [class*='userProfileModal']"),
    );
    for (const card of profileCards) {
      const displayName = textContent(card.querySelector("h1, h2, [class*='username'], [class*='nickname']"));
      const bio = textContent(card.querySelector("[class*='bio'], [class*='aboutMe']"));
      if (!displayName) {
        continue;
      }
      contacts.push(
        normalizeContact(
          createContact({
            source: "discord",
            sourceUrl,
            displayName,
            title: bio,
            confidence: "dom",
          }),
        ),
      );
    }

    return uniqueBy(contacts, (contact) => contact.displayName ?? contact.id);
  },
};

export const telegramAdapter: SiteAdapter = {
  id: "telegram-web",
  adapterVersion: "1.0.0",
  match(url: URL) {
    return url.hostname === "web.telegram.org";
  },
  async extract(ctx: ExtractContext): Promise<Contact[]> {
    const sourceUrl = ctx.url.href;
    const contacts: Contact[] = [];

    const listRoots = Array.from(
      ctx.document.querySelectorAll(".chatlist, .contacts-container, .LeftColumn, #LeftColumn"),
    );

    for (const root of listRoots.length ? listRoots : [ctx.document.body]) {
      await autoScrollElement(root, { maxSteps: 30 });
      const rows = Array.from(
        root.querySelectorAll(".chatlist-chat, .ListItem, .dialog, [data-peer-id]"),
      );

      for (const row of rows) {
        const displayName = textContent(
          row.querySelector(".user-title, .peer-title, .title, .fullName, h3"),
        );
        const subtitle = textContent(row.querySelector(".user-last-message, .subtitle, .status"));
        const phoneMatch = subtitle?.match(/\+?\d[\d\s()-]{6,}/);

        if (!displayName) {
          continue;
        }

        contacts.push(
          normalizeContact(
            createContact({
              source: "telegram",
              sourceUrl,
              displayName,
              phones: phoneMatch ? [{ value: phoneMatch[0] }] : undefined,
              confidence: "dom",
            }),
            ctx.options.defaultPhoneRegion,
          ),
        );
      }
    }

    const memberDialogs = Array.from(
      ctx.document.querySelectorAll(".GroupInfo, .profile-content, .chat-info"),
    );
    for (const dialog of memberDialogs) {
      await autoScrollElement(dialog, { maxSteps: 20 });
      const members = Array.from(dialog.querySelectorAll(".member, .chat-member, .ListItem"));
      for (const member of members) {
        const displayName = textContent(member.querySelector(".name, .peer-title, .title"));
        if (!displayName) {
          continue;
        }
        contacts.push(
          normalizeContact(
            createContact({
              source: "telegram",
              sourceUrl,
              displayName,
              confidence: "dom",
            }),
            ctx.options.defaultPhoneRegion,
          ),
        );
      }
    }

    return uniqueBy(contacts, (contact) =>
      contact.phones?.[0]?.value ?? contact.displayName ?? contact.id,
    );
  },
};

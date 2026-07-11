import type { Contact, ContactConfidence } from "../types";
import { createContact } from "../contact-utils";
import { extractEmailsFromText, extractPhonesFromText } from "../normalizer";

interface JsonLdNode {
  "@type"?: string | string[];
  name?: string;
  givenName?: string;
  familyName?: string;
  email?: string | string[];
  telephone?: string | string[];
  jobTitle?: string;
  worksFor?: { name?: string } | string;
  url?: string | string[];
  image?: string | { url?: string };
}

export function parseJsonLdContacts(document: Document, sourceUrl: string): Contact[] {
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  const contacts: Contact[] = [];

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent ?? "") as unknown;
      collectJsonLdPersons(parsed, sourceUrl, contacts);
    } catch {
      continue;
    }
  }

  return contacts;
}

function collectJsonLdPersons(node: unknown, sourceUrl: string, contacts: Contact[]): void {
  if (!node) {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectJsonLdPersons(item, sourceUrl, contacts);
    }
    return;
  }

  if (typeof node !== "object") {
    return;
  }

  const record = node as Record<string, unknown>;
  if ("@graph" in record) {
    collectJsonLdPersons(record["@graph"], sourceUrl, contacts);
  }

  if (isPersonNode(record)) {
    contacts.push(jsonLdNodeToContact(record as JsonLdNode, sourceUrl));
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      collectJsonLdPersons(value, sourceUrl, contacts);
    }
  }
}

function isPersonNode(node: Record<string, unknown>): boolean {
  const type = node["@type"];
  if (typeof type === "string") {
    return type.toLowerCase() === "person";
  }
  if (Array.isArray(type)) {
    return type.some((entry) => typeof entry === "string" && entry.toLowerCase() === "person");
  }
  return false;
}

function jsonLdNodeToContact(node: JsonLdNode, sourceUrl: string): Contact {
  const emails = toArray(node.email)
    .map((value) => ({ value }))
    .filter((entry) => entry.value);
  const phones = toArray(node.telephone)
    .map((value) => ({ value }))
    .filter((entry) => entry.value);
  const urls = toArray(node.url).filter(Boolean);
  const org =
    typeof node.worksFor === "string"
      ? node.worksFor
      : typeof node.worksFor === "object"
        ? node.worksFor?.name
        : undefined;
  const photoUrl =
    typeof node.image === "string"
      ? node.image
      : typeof node.image === "object"
        ? node.image?.url
        : undefined;

  return createContact({
    source: "generic",
    sourceUrl,
    displayName: node.name,
    givenName: node.givenName,
    familyName: node.familyName,
    emails: emails.length ? emails : undefined,
    phones: phones.length ? phones : undefined,
    title: node.jobTitle,
    org,
    urls: urls.length ? urls : undefined,
    photoUrl,
    confidence: "structured",
  });
}

export function parseHCardContacts(document: Document, sourceUrl: string): Contact[] {
  const cards = Array.from(document.querySelectorAll(".h-card, .vcard, [class*='h-card']"));
  const contacts: Contact[] = [];

  for (const card of cards) {
    const displayName = textFrom(card, ".p-name, .fn") ?? undefined;
    const givenName = textFrom(card, ".p-given-name") ?? undefined;
    const familyName = textFrom(card, ".p-family-name") ?? undefined;
    const org = textFrom(card, ".p-org, .org") ?? undefined;
    const title = textFrom(card, ".p-job-title, .title") ?? undefined;
    const emails = Array.from(card.querySelectorAll(".p-email, .email, a[href^='mailto:']")).map(
      (element) => ({
        value: emailFromElement(element),
      }),
    );
    const phones = Array.from(card.querySelectorAll(".p-tel, .tel, a[href^='tel:']")).map(
      (element) => ({
        value: phoneFromElement(element),
      }),
    );
    const urls = Array.from(card.querySelectorAll(".u-url, .url, a[href^='http']"))
      .map((element) => element.getAttribute("href") ?? element.textContent?.trim() ?? "")
      .filter(Boolean);
    const photo = card.querySelector(".u-photo, .photo")?.getAttribute("src") ?? undefined;

    if (!displayName && !emails.length && !phones.length) {
      continue;
    }

    contacts.push(
      createContact({
        source: "generic",
        sourceUrl,
        displayName,
        givenName,
        familyName,
        org,
        title,
        emails: uniqueEmails(emails),
        phones: uniquePhones(phones),
        urls: urls.length ? Array.from(new Set(urls)) : undefined,
        photoUrl: photo,
        confidence: "structured",
      }),
    );
  }

  return contacts;
}

export function parseSemanticDomContacts(document: Document, sourceUrl: string): Contact[] {
  const contacts: Contact[] = [];
  const emailLinks = Array.from(document.querySelectorAll("a[href^='mailto:'], [itemprop='email']"));
  const telLinks = Array.from(document.querySelectorAll("a[href^='tel:'], [itemprop='telephone']"));

  for (const element of emailLinks) {
    const email = emailFromElement(element);
    if (!email) {
      continue;
    }
    contacts.push(
      createContact({
        source: "generic",
        sourceUrl,
        emails: [{ value: email }],
        displayName: nearbyName(element) ?? email,
        confidence: "dom",
      }),
    );
  }

  for (const element of telLinks) {
    const phone = phoneFromElement(element);
    if (!phone) {
      continue;
    }
    contacts.push(
      createContact({
        source: "generic",
        sourceUrl,
        phones: [{ value: phone }],
        displayName: nearbyName(element) ?? phone,
        confidence: "dom",
      }),
    );
  }

  return contacts;
}

export function parseRegexContacts(
  document: Document,
  sourceUrl: string,
  confidence: ContactConfidence = "regex",
  maxChars = 500_000,
): Contact[] {
  const rawText = document.body?.innerText || document.body?.textContent || "";
  const text = rawText.slice(0, maxChars);
  const emails = extractEmailsFromText(text);
  const phones = extractPhonesFromText(text);

  const contacts: Contact[] = [];
  for (const email of emails) {
    contacts.push(
      createContact({
        source: "generic",
        sourceUrl,
        displayName: email.value,
        emails: [email],
        confidence,
      }),
    );
  }
  for (const phone of phones) {
    contacts.push(
      createContact({
        source: "generic",
        sourceUrl,
        displayName: phone.value,
        phones: [phone],
        confidence,
      }),
    );
  }

  return contacts;
}

function textFrom(root: ParentNode, selector: string): string | null {
  const element = root.querySelector(selector);
  const value = element?.textContent?.trim();
  return value || null;
}

function emailFromElement(element: Element): string {
  const href = element.getAttribute("href");
  if (href?.startsWith("mailto:")) {
    return href.replace(/^mailto:/i, "").split("?")[0]?.trim() ?? "";
  }
  return element.textContent?.trim() ?? "";
}

function phoneFromElement(element: Element): string {
  const href = element.getAttribute("href");
  if (href?.startsWith("tel:")) {
    return href.replace(/^tel:/i, "").trim();
  }
  return element.textContent?.trim() ?? "";
}

function nearbyName(element: Element): string | null {
  const container = element.closest("article, section, li, tr, div");
  const heading = container?.querySelector("h1, h2, h3, h4, .name, .display-name");
  return heading?.textContent?.trim() ?? null;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function uniqueEmails(values: { value: string }[]): { value: string }[] | undefined {
  const map = new Map<string, { value: string }>();
  for (const entry of values) {
    if (entry.value) {
      map.set(entry.value.toLowerCase(), entry);
    }
  }
  const result = Array.from(map.values());
  return result.length ? result : undefined;
}

function uniquePhones(values: { value: string }[]): { value: string }[] | undefined {
  const map = new Map<string, { value: string }>();
  for (const entry of values) {
    if (entry.value) {
      map.set(entry.value, entry);
    }
  }
  const result = Array.from(map.values());
  return result.length ? result : undefined;
}

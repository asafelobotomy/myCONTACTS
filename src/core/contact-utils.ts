import type { Contact, ContactConfidence } from "./types";
import { humanDisplayName } from "./contact-name";

let counter = 0;

export function createContactId(): string {
  counter += 1;
  return `contact-${Date.now()}-${counter}`;
}

export function createContact(
  partial: Omit<Contact, "id" | "extractedAt"> & { id?: string; extractedAt?: string },
): Contact {
  return {
    id: partial.id ?? createContactId(),
    extractedAt: partial.extractedAt ?? new Date().toISOString(),
    source: partial.source,
    sourceUrl: partial.sourceUrl,
    sourceId: partial.sourceId,
    displayName: partial.displayName,
    givenName: partial.givenName,
    familyName: partial.familyName,
    alternateNames: partial.alternateNames,
    phones: partial.phones,
    emails: partial.emails,
    org: partial.org,
    title: partial.title,
    urls: partial.urls,
    photoUrl: partial.photoUrl,
    notes: partial.notes,
    confidence: partial.confidence,
  };
}

export function contactPersonName(contact: Contact): string | undefined {
  const composed = [contact.givenName, contact.familyName].filter(Boolean).join(" ").trim();
  return humanDisplayName(contact.displayName) ?? humanDisplayName(composed);
}

export function isNamedContact(contact: Contact): boolean {
  return Boolean(contactPersonName(contact));
}

export function applyContactInclusionPolicy(
  contacts: Contact[],
  includeUnnamedContacts: boolean,
): Contact[] {
  if (includeUnnamedContacts) {
    return contacts;
  }

  return contacts.filter(isNamedContact);
}

export function contactDisplayName(contact: Contact): string {
  return (
    contactPersonName(contact) ||
    contact.phones?.[0]?.value ||
    contact.emails?.[0]?.value ||
    "Unknown"
  );
}

export function mergeContacts(existing: Contact[], incoming: Contact[]): Contact[] {
  const byKey = new Map<string, Contact>();

  for (const contact of existing) {
    byKey.set(contactDedupeKey(contact), contact);
  }

  for (const contact of incoming) {
    const key = contactDedupeKey(contact);
    const prior = byKey.get(key);
    if (prior) {
      byKey.set(key, mergeContactRecords(prior, contact));
    } else {
      byKey.set(key, contact);
    }
  }

  return Array.from(byKey.values()).sort((a, b) =>
    contactDisplayName(a).localeCompare(contactDisplayName(b)),
  );
}

export function contactDedupeKey(contact: Contact): string {
  const phone = contact.phones?.find((p) => p.e164 || p.value)?.e164 ?? contact.phones?.[0]?.value;
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    return `phone:${digits || normalizeScalar(phone)}`;
  }
  const email = contact.emails?.[0]?.value;
  if (email) {
    return `email:${normalizeScalar(email)}`;
  }
  const name = contactDisplayName(contact);
  const url = contact.urls?.[0] ?? contact.sourceUrl ?? "";
  return `name:${normalizeScalar(name)}|url:${normalizeScalar(url)}|source:${contact.source}`;
}

function mergeContactRecords(a: Contact, b: Contact): Contact {
  const confidenceRank: Record<ContactConfidence, number> = {
    structured: 4,
    dom: 3,
    regex: 2,
    inferred: 1,
  };

  return createContact({
    id: a.id,
    source: a.source,
    sourceUrl: a.sourceUrl ?? b.sourceUrl,
    sourceId: a.sourceId ?? b.sourceId,
    displayName: pickBestDisplayName(a.displayName, b.displayName),
    givenName: a.givenName ?? b.givenName,
    familyName: a.familyName ?? b.familyName,
    alternateNames: (() => {
      const merged = uniqueStrings([...(a.alternateNames ?? []), ...(b.alternateNames ?? [])]);
      return merged.length ? merged : undefined;
    })(),
    phones: mergePhones(a.phones ?? [], b.phones ?? []),
    emails: mergeEmails(a.emails ?? [], b.emails ?? []),
    org: a.org ?? b.org,
    title: a.title ?? b.title,
    urls: uniqueStrings([...(a.urls ?? []), ...(b.urls ?? [])]),
    photoUrl: a.photoUrl ?? b.photoUrl,
    notes: mergeNotes(a.notes, b.notes),
    extractedAt: a.extractedAt > b.extractedAt ? a.extractedAt : b.extractedAt,
    confidence:
      confidenceRank[a.confidence] >= confidenceRank[b.confidence] ? a.confidence : b.confidence,
  });
}

function mergePhones(
  a: NonNullable<Contact["phones"]>,
  b: NonNullable<Contact["phones"]>,
): NonNullable<Contact["phones"]> {
  const map = new Map<string, NonNullable<Contact["phones"]>[number]>();
  for (const phone of [...a, ...b]) {
    const key = phone.e164 ?? phone.value;
    map.set(key, phone);
  }
  return Array.from(map.values());
}

function mergeEmails(
  a: NonNullable<Contact["emails"]>,
  b: NonNullable<Contact["emails"]>,
): NonNullable<Contact["emails"]> {
  const map = new Map<string, NonNullable<Contact["emails"]>[number]>();
  for (const email of [...a, ...b]) {
    map.set(email.value.toLowerCase(), email);
  }
  return Array.from(map.values());
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function mergeNotes(a?: string, b?: string): string | undefined {
  if (!a) {
    return b;
  }
  if (!b || a === b) {
    return a;
  }
  return uniqueStrings([a, b]).join(" | ");
}

function normalizeScalar(value: string): string {
  return value.trim().toLowerCase();
}

function pickBestDisplayName(a?: string, b?: string): string | undefined {
  const candidates = [a, b]
    .map((value) => humanDisplayName(value))
    .filter((value): value is string => Boolean(value));
  if (!candidates.length) {
    return undefined;
  }

  return candidates.sort((left, right) => scoreDisplayName(right) - scoreDisplayName(left))[0];
}

function scoreDisplayName(value: string): number {
  const trimmed = value.trim();
  let score = trimmed.length;

  if (/\s/.test(trimmed)) {
    score += 10;
  }

  return score;
}

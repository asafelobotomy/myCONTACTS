import type { CountryCode } from "libphonenumber-js";
import { findPhoneNumbersInText } from "libphonenumber-js";
import { humanDisplayName } from "./contact-name";
import {
  contactPhoneFromParsed,
  parseRegionAwarePhone,
  type PhoneParseOptions,
} from "./phone-region";
import type { Contact, ContactEmail, ContactPhone } from "./types";

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export function normalizePhone(value: string, options: PhoneParseOptions = {}): ContactPhone | null {
  const parsed = parseRegionAwarePhone(value, options);
  if (!parsed) {
    return null;
  }

  return contactPhoneFromParsed(parsed);
}

export function normalizeEmail(value: string): ContactEmail | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || !EMAIL_PATTERN.test(trimmed)) {
    return null;
  }
  EMAIL_REGEX.lastIndex = 0;
  return { value: trimmed };
}

export function extractPhonesFromText(text: string, defaultCountry?: CountryCode): ContactPhone[] {
  const matches = findPhoneNumbersInText(text, defaultCountry ? { defaultCountry } : undefined);
  const phones: ContactPhone[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    const normalized = normalizePhone(match.number.number, { defaultCountry });
    if (!normalized) {
      continue;
    }
    const key = normalized.e164 ?? normalized.value;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    phones.push(normalized);
  }

  return phones;
}

export function extractEmailsFromText(text: string): ContactEmail[] {
  const emails: ContactEmail[] = [];
  const seen = new Set<string>();
  const matches = text.match(EMAIL_REGEX) ?? [];

  for (const match of matches) {
    const normalized = normalizeEmail(match);
    if (!normalized || seen.has(normalized.value)) {
      continue;
    }
    seen.add(normalized.value);
    emails.push(normalized);
  }

  EMAIL_REGEX.lastIndex = 0;
  return emails;
}

export function normalizeContactPhones(
  phones: ContactPhone[] | undefined,
  defaultCountry?: CountryCode,
): ContactPhone[] | undefined {
  if (!phones?.length) {
    return undefined;
  }

  const normalized = phones
    .map((phone) => normalizePhone(phone.e164 ?? phone.value, { defaultCountry }))
    .filter((phone): phone is ContactPhone => phone !== null);

  return normalized.length ? dedupePhones(normalized) : undefined;
}

export function normalizeContactEmails(emails: ContactEmail[] | undefined): ContactEmail[] | undefined {
  if (!emails?.length) {
    return undefined;
  }

  const normalized = emails
    .map((email) => normalizeEmail(email.value))
    .filter((email): email is ContactEmail => email !== null);

  return normalized.length ? dedupeEmails(normalized) : undefined;
}

export function normalizeContact(contact: Contact, defaultCountry?: CountryCode): Contact {
  return {
    ...contact,
    phones: normalizeContactPhones(contact.phones, defaultCountry),
    emails: normalizeContactEmails(contact.emails),
    displayName: humanDisplayName(contact.displayName),
    givenName: humanDisplayName(contact.givenName),
    familyName: humanDisplayName(contact.familyName),
    org: contact.org?.trim() || undefined,
    title: contact.title?.trim() || undefined,
    notes: contact.notes?.trim() || undefined,
  };
}

function dedupePhones(phones: ContactPhone[]): ContactPhone[] {
  const map = new Map<string, ContactPhone>();
  for (const phone of phones) {
    map.set(phone.e164 ?? phone.value, phone);
  }
  return Array.from(map.values());
}

function dedupeEmails(emails: ContactEmail[]): ContactEmail[] {
  const map = new Map<string, ContactEmail>();
  for (const email of emails) {
    map.set(email.value, email);
  }
  return Array.from(map.values());
}

import type { CountryCode } from "libphonenumber-js";
import type { Contact } from "../types";
import { createContact } from "../contact-utils";
import { isValidContactPhone } from "../phone-region";
import {
  humanDisplayName,
  isBlockedDisplayName,
  MAX_PHONE_DIGITS,
  MIN_PHONE_DIGITS,
} from "../contact-name";
import type { RawIndexedDbContact } from "./whatsapp-indexeddb";

export { MAX_PHONE_DIGITS, MIN_PHONE_DIGITS, humanDisplayName, isBlockedDisplayName };

const GROUP_RECORD_KEYS = [
  "isGroup",
  "isParentGroup",
  "isParentGroupBlocked",
  "groupMetadata",
  "groupType",
] as const;

export function isGroupJid(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return (
    value.includes("@g.us") ||
    value.includes("@broadcast") ||
    value.includes("@newsletter") ||
    value.includes("@temp")
  );
}

export function isIndividualContactJid(value: string | undefined): boolean {
  if (!value || isGroupJid(value)) {
    return false;
  }

  return value.includes("@s.whatsapp.net") || value.includes("@c.us");
}

export function phoneDigitsFromJid(value: string | undefined): string | undefined {
  if (!isIndividualContactJid(value)) {
    return undefined;
  }

  return normalizePhoneDigits(value!.split("@")[0] ?? "");
}

export function normalizePhoneDigits(value: string): string | undefined {
  const digits = value.replace(/\D/g, "");
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
    return undefined;
  }
  return digits;
}

export function formatPhone(digits: string): string {
  return `+${digits}`;
}

export function isGroupRecord(obj: Record<string, unknown>): boolean {
  for (const key of GROUP_RECORD_KEYS) {
    if (key in obj) {
      return true;
    }
  }

  for (const value of Object.values(obj)) {
    if (typeof value === "string" && isGroupJid(value)) {
      return true;
    }
  }

  return false;
}

export function isExportableWhatsAppContact(contact: Contact, defaultCountry?: CountryCode): boolean {
  const phone = contact.phones?.find((entry) => entry.e164 || entry.value);
  if (!phone) {
    return false;
  }

  if (!isValidContactPhone(phone.e164 ?? phone.value, defaultCountry)) {
    return false;
  }

  if (contact.displayName && isBlockedDisplayName(contact.displayName)) {
    return false;
  }

  return true;
}

const NAME_PRIORITY: Array<keyof RawIndexedDbContact> = [
  "savedName",
  "verifiedName",
  "formattedName",
  "pushname",
  "shortName",
  "notifyName",
  "mentionName",
];

export function rawIndexedDbContactToContact(
  raw: RawIndexedDbContact,
  sourceUrl: string,
): Contact {
  const displayName = pickBestWhatsAppDisplayName(raw);
  const alternateNames = collectAlternateNames(raw, displayName);
  const nameParts = splitNameParts(displayName);
  const notes = buildContactNotes(raw);
  const waMeUrl = raw.id ? buildWhatsAppMeUrl(raw.id) : undefined;
  const urls = uniqueStrings([...(raw.website ? [raw.website] : []), ...(waMeUrl ? [waMeUrl] : [])]);

  return createContact({
    source: "whatsapp",
    sourceUrl,
    sourceId: raw.id,
    displayName,
    givenName: nameParts.givenName,
    familyName: nameParts.familyName,
    alternateNames,
    phones: raw.phone ? [{ value: raw.phone }] : undefined,
    emails: raw.email ? [{ value: raw.email }] : undefined,
    org: raw.org,
    title: raw.title,
    urls: urls.length ? urls : undefined,
    photoUrl: raw.photoUrl,
    notes,
    confidence: "structured",
  });
}

export function pickBestWhatsAppDisplayName(raw: RawIndexedDbContact): string | undefined {
  for (const key of NAME_PRIORITY) {
    const value = humanDisplayName(raw[key] as string | undefined);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function collectAlternateNames(raw: RawIndexedDbContact, primary?: string): string[] | undefined {
  const names = NAME_PRIORITY.map((key) => humanDisplayName(raw[key] as string | undefined)).filter(
    (value): value is string => Boolean(value),
  );

  const unique = Array.from(new Set(names)).filter((value) => value !== primary);
  return unique.length ? unique : undefined;
}

function splitNameParts(displayName?: string): { givenName?: string; familyName?: string } {
  if (!displayName) {
    return {};
  }

  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { givenName: parts[0] };
  }

  return {
    givenName: parts[0],
    familyName: parts.slice(1).join(" "),
  };
}

function buildContactNotes(raw: RawIndexedDbContact): string | undefined {
  const parts: string[] = [];

  if (raw.status?.trim()) {
    parts.push(raw.status.trim());
  }

  if (raw.labels?.length) {
    parts.push(`Labels: ${raw.labels.join(", ")}`);
  }

  return parts.length ? parts.join(" | ") : undefined;
}

function phoneDigitsFromContactJid(jid: string): string | undefined {
  if (!jid.includes("@")) {
    return undefined;
  }

  const user = jid.split("@")[0] ?? "";
  const digits = user.replace(/\D/g, "");
  return digits.length >= MIN_PHONE_DIGITS && digits.length <= MAX_PHONE_DIGITS ? digits : undefined;
}

function buildWhatsAppMeUrl(jid: string): string | undefined {
  const digits = phoneDigitsFromContactJid(jid);
  return digits ? `https://wa.me/${digits}` : undefined;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

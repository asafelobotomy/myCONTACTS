import type { Contact, ContactEmail, ContactPhone } from "./types";

/** Google Contacts CSV supports many slots; cap keeps files readable. */
export const GOOGLE_CSV_MAX_PHONES = 5;
export const GOOGLE_CSV_MAX_EMAILS = 5;
export const GOOGLE_CSV_MAX_WEBSITES = 3;

export const GOOGLE_CSV_BASE_HEADERS = [
  "First Name",
  "Middle Name",
  "Last Name",
  "Phonetic First Name",
  "Phonetic Middle Name",
  "Phonetic Last Name",
  "Name Prefix",
  "Name Suffix",
  "Nickname",
  "File As",
  "Organization Name",
  "Organization Title",
  "Organization Department",
  "Birthday",
  "Notes",
  "Photo",
  "Labels",
] as const;

export function buildGoogleCsvHeaders(
  maxPhones: number,
  maxEmails: number,
  maxWebsites: number,
): string[] {
  const headers = [...GOOGLE_CSV_BASE_HEADERS];

  for (let index = 1; index <= maxEmails; index += 1) {
    headers.push(`E-mail ${index} - Label`, `E-mail ${index} - Value`);
  }

  for (let index = 1; index <= maxPhones; index += 1) {
    headers.push(`Phone ${index} - Label`, `Phone ${index} - Value`);
  }

  for (let index = 1; index <= maxWebsites; index += 1) {
    headers.push(`Website ${index} - Label`, `Website ${index} - Value`);
  }

  return headers;
}

export function resolveExportNameFields(contact: Contact): {
  fileAs: string;
  givenName: string;
  familyName: string;
} {
  let givenName = contact.givenName?.trim() ?? "";
  let familyName = contact.familyName?.trim() ?? "";
  const display = contact.displayName?.trim()
    ?? [givenName, familyName].filter(Boolean).join(" ").trim();

  if (!givenName && !familyName && display) {
    const parts = display.split(/\s+/);
    if (parts.length === 1) {
      givenName = parts[0] ?? "";
    } else {
      givenName = parts[0] ?? "";
      familyName = parts.slice(1).join(" ");
    }
  }

  return {
    fileAs: display || [givenName, familyName].filter(Boolean).join(" "),
    givenName,
    familyName,
  };
}

export function googlePhoneLabel(phone: ContactPhone): string {
  switch (phone.type?.toLowerCase()) {
    case "home":
      return "Home";
    case "work":
      return "Work";
    case "main":
      return "Main";
    case "fax":
    case "work fax":
      return "Work Fax";
    case "home fax":
      return "Home Fax";
    case "pager":
      return "Pager";
    case "other":
      return "Other";
    case "mobile":
    case "cell":
    default:
      return "Mobile";
  }
}

export function googleEmailLabel(email: ContactEmail): string {
  switch (email.type?.toLowerCase()) {
    case "home":
      return "Home";
    case "work":
      return "Work";
    case "other":
      return "Other";
    default:
      return "Work";
  }
}

export function vcardPhoneType(phone: ContactPhone): string {
  switch (phone.type?.toLowerCase()) {
    case "home":
      return "home";
    case "work":
      return "work";
    case "fax":
      return "fax";
    case "pager":
      return "pager";
    case "mobile":
    case "cell":
    default:
      return "cell";
  }
}

export function vcardEmailType(email: ContactEmail): string | undefined {
  switch (email.type?.toLowerCase()) {
    case "home":
      return "home";
    case "work":
      return "work";
    default:
      return undefined;
  }
}

export function formatPhoneExportValue(phone: ContactPhone): string {
  return phone.e164 ?? phone.value;
}

export function formatTelUri(phone: ContactPhone): string {
  const value = formatPhoneExportValue(phone).replace(/\s+/g, "");
  return value.startsWith("tel:") ? value : `tel:${value}`;
}

export function toVcardTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return toVcardTimestamp(new Date().toISOString());
  }

  const pad = (part: number) => String(part).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

export function buildGoogleCsvNotes(contact: Contact): string {
  const parts: string[] = [];

  if (contact.notes?.trim()) {
    parts.push(contact.notes.trim());
  }

  if (contact.sourceId?.trim()) {
    parts.push(`Source ID: ${contact.sourceId.trim()}`);
  }

  if (contact.sourceUrl?.trim()) {
    parts.push(`Source URL: ${contact.sourceUrl.trim()}`);
  }

  return parts.join("\n");
}

export function buildGoogleCsvLabels(contact: Contact): string {
  const labels = ["myCONTACTS"];
  if (contact.source.trim()) {
    labels.push(contact.source.trim());
  }
  return labels.join(" ::: ");
}

export function countGoogleCsvSlots(contacts: Contact[]): {
  maxPhones: number;
  maxEmails: number;
  maxWebsites: number;
} {
  if (contacts.length === 0) {
    return { maxPhones: 0, maxEmails: 0, maxWebsites: 0 };
  }

  const maxPhones = Math.min(
    GOOGLE_CSV_MAX_PHONES,
    Math.max(0, ...contacts.map((contact) => contact.phones?.length ?? 0)),
  );
  const maxEmails = Math.min(
    GOOGLE_CSV_MAX_EMAILS,
    Math.max(0, ...contacts.map((contact) => contact.emails?.length ?? 0)),
  );
  const maxWebsites = Math.min(
    GOOGLE_CSV_MAX_WEBSITES,
    Math.max(0, ...contacts.map((contact) => contact.urls?.length ?? 0)),
  );

  return { maxPhones, maxEmails, maxWebsites };
}

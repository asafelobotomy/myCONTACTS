import { contactDisplayName } from "./contact-utils";
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
  const headers: string[] = [...GOOGLE_CSV_BASE_HEADERS];

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

export function vcard30PhoneType(phone: ContactPhone): string {
  switch (phone.type?.toLowerCase()) {
    case "home":
      return "HOME";
    case "work":
      return "WORK";
    case "fax":
      return "FAX";
    case "pager":
      return "PAGER";
    case "mobile":
    case "cell":
    default:
      return "CELL";
  }
}

export function vcard30EmailTypes(email: ContactEmail): string[] {
  switch (email.type?.toLowerCase()) {
    case "home":
      return ["INTERNET", "HOME"];
    case "work":
      return ["INTERNET", "WORK"];
    case "other":
      return ["INTERNET", "OTHER"];
    default:
      return ["INTERNET"];
  }
}

export function formatVcard30EmailLine(email: ContactEmail): string {
  const typeParams = vcard30EmailTypes(email).map((type) => `TYPE=${type}`).join(";");
  return `EMAIL;${typeParams}:${escapeVcardText(email.value)}`;
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

export function escapeVcardText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export function formatVcardNLine(contact: Contact): string | undefined {
  const names = resolveExportNameFields(contact);
  if (!names.givenName && !names.familyName) {
    return undefined;
  }

  return (
    `N:${escapeVcardText(names.familyName)};${escapeVcardText(names.givenName)};;;`
  );
}

export type JcardProperty = [string, Record<string, unknown>, string, unknown];

export function buildJcardNComponent(contact: Contact): JcardProperty | undefined {
  const names = resolveExportNameFields(contact);
  if (!names.givenName && !names.familyName) {
    return undefined;
  }

  return ["n", {}, "text", [names.familyName, names.givenName, "", "", ""]];
}

export function injectVcardNLine(vcardText: string, nLine: string | undefined): string {
  if (!nLine) {
    return vcardText;
  }

  const marker = "VERSION:4.0\r\n";
  if (!vcardText.includes(marker) || vcardText.includes("\r\nN:")) {
    return vcardText;
  }

  return vcardText.replace(marker, `${marker}${nLine}\r\n`);
}

export function injectJcardNComponent(
  jcard: unknown,
  nComponent: JcardProperty | undefined,
): unknown {
  if (!nComponent || !Array.isArray(jcard) || jcard[0] !== "vcard" || !Array.isArray(jcard[1])) {
    return jcard;
  }

  const properties = jcard[1] as unknown[];
  if (properties.some((entry) => Array.isArray(entry) && entry[0] === "n")) {
    return jcard;
  }

  return ["vcard", [nComponent, ...properties]];
}

export function buildVcardNote(contact: Contact): string | undefined {
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

  return parts.length ? parts.join("\n") : undefined;
}

export function serializeContactVcard30(contact: Contact): string {
  const lines: string[] = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVcardText(contactDisplayName(contact))}`,
  ];

  const nLine = formatVcardNLine(contact);
  if (nLine) {
    lines.push(nLine);
  }

  lines.push(`UID:urn:uuid:${contact.id}`);
  lines.push("PRODID:-//myCONTACTS//EN");
  lines.push(`REV:${toVcardTimestamp(contact.extractedAt)}`);

  const nicknames = (contact.alternateNames ?? [])
    .map((name) => name.trim())
    .filter(Boolean);
  if (nicknames.length === 1) {
    lines.push(`NICKNAME:${escapeVcardText(nicknames[0]!)}`);
  } else if (nicknames.length > 1) {
    lines.push(`NICKNAME:${nicknames.map(escapeVcardText).join(",")}`);
  }

  for (const phone of contact.phones ?? []) {
    const type = vcard30PhoneType(phone);
    lines.push(`TEL;TYPE=${type}:${escapeVcardText(formatPhoneExportValue(phone))}`);
  }

  for (const email of contact.emails ?? []) {
    lines.push(formatVcard30EmailLine(email));
  }

  if (contact.org?.trim()) {
    lines.push(`ORG:${escapeVcardText(contact.org.trim())}`);
  }

  if (contact.title?.trim()) {
    lines.push(`TITLE:${escapeVcardText(contact.title.trim())}`);
  }

  for (const url of contact.urls ?? []) {
    const trimmed = url.trim();
    if (trimmed) {
      lines.push(`URL:${trimmed}`);
    }
  }

  if (contact.photoUrl?.trim()) {
    lines.push(`PHOTO;VALUE=URI:${contact.photoUrl.trim()}`);
  }

  const categories = ["myCONTACTS", contact.source.trim()].filter(Boolean);
  lines.push(`CATEGORIES:${categories.map(escapeVcardText).join(",")}`);

  const note = buildVcardNote(contact);
  if (note) {
    lines.push(`NOTE:${escapeVcardText(note)}`);
  }

  lines.push("END:VCARD");
  return lines.join("\r\n");
}

export function serializeContactJcard(contact: Contact): [string, JcardProperty[]] {
  const props: JcardProperty[] = [
    ["version", {}, "text", "4.0"],
    ["kind", {}, "text", "individual"],
    ["fn", {}, "text", contactDisplayName(contact)],
  ];

  const nComponent = buildJcardNComponent(contact);
  if (nComponent) {
    props.push(nComponent);
  }

  props.push(["uid", {}, "uri", `urn:uuid:${contact.id}`]);
  props.push(["prodid", {}, "text", "-//myCONTACTS//EN"]);
  props.push(["rev", {}, "timestamp", toVcardTimestamp(contact.extractedAt)]);

  const nicknames = (contact.alternateNames ?? [])
    .map((name) => name.trim())
    .filter(Boolean);
  if (nicknames.length === 1) {
    props.push(["nickname", {}, "text", nicknames[0]!]);
  } else if (nicknames.length > 1) {
    props.push(["nickname", {}, "text", nicknames]);
  }

  for (const phone of contact.phones ?? []) {
    const type = vcardPhoneType(phone);
    props.push(["tel", { type }, "uri", formatTelUri(phone)]);
  }

  for (const email of contact.emails ?? []) {
    const type = vcardEmailType(email);
    props.push(type ? ["email", { type }, "text", email.value] : ["email", {}, "text", email.value]);
  }

  if (contact.org?.trim()) {
    props.push(["org", {}, "text", contact.org.trim()]);
  }

  if (contact.title?.trim()) {
    props.push(["title", {}, "text", contact.title.trim()]);
  }

  for (const url of contact.urls ?? []) {
    const trimmed = url.trim();
    if (trimmed) {
      props.push(["url", {}, "uri", trimmed]);
    }
  }

  if (contact.photoUrl?.trim()) {
    props.push(["photo", {}, "uri", contact.photoUrl.trim()]);
  }

  if (contact.sourceUrl?.trim()) {
    props.push(["source", {}, "uri", contact.sourceUrl.trim()]);
  }

  props.push(["categories", {}, "text", ["myCONTACTS", contact.source.trim()].filter(Boolean)]);

  const note = buildVcardNote(contact);
  if (note) {
    props.push(["note", {}, "text", note]);
  }

  return ["vcard", props];
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

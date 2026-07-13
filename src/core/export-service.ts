import {
  buildGoogleCsvHeaders,
  buildGoogleCsvLabels,
  buildGoogleCsvNotes,
  countGoogleCsvSlots,
  formatPhoneExportValue,
  googleEmailLabel,
  googlePhoneLabel,
  resolveExportNameFields,
  serializeContactJcard,
  serializeContactVcard30,
} from "./export-standards";
import type { Contact, ExportFormat } from "./types";

export interface ExportResult {
  filename: string;
  mimeType: string;
  content: string;
}

export function exportContacts(contacts: Contact[], format: ExportFormat): ExportResult {
  switch (format) {
    case "csv":
      return exportCsv(contacts);
    case "vcard":
      return exportVcard(contacts);
    case "json":
      return exportJson(contacts);
    default: {
      const exhaustive: never = format;
      throw new Error(`Unsupported export format: ${exhaustive}`);
    }
  }
}

function exportJson(contacts: Contact[]): ExportResult {
  const jcards = contacts.map((contact) => serializeContactJcard(contact));

  return {
    filename: `mycontacts-${timestamp()}.json`,
    mimeType: "application/vcard+json",
    content: JSON.stringify(jcards, null, 2),
  };
}

function exportCsv(contacts: Contact[]): ExportResult {
  const { maxPhones, maxEmails, maxWebsites } = countGoogleCsvSlots(contacts);
  const headers = buildGoogleCsvHeaders(maxPhones, maxEmails, maxWebsites);
  const rows = contacts.map((contact) =>
    buildGoogleCsvRow(contact, maxPhones, maxEmails, maxWebsites).map(csvEscape).join(","),
  );

  return {
    filename: `mycontacts-${timestamp()}.csv`,
    mimeType: "text/csv;charset=utf-8",
    content: `\uFEFF${[headers.join(","), ...rows].join("\r\n")}`,
  };
}

function buildGoogleCsvRow(
  contact: Contact,
  maxPhones: number,
  maxEmails: number,
  maxWebsites: number,
): string[] {
  const names = resolveExportNameFields(contact);
  const row: string[] = [
    names.givenName,
    "",
    names.familyName,
    "",
    "",
    "",
    "",
    "",
    (contact.alternateNames ?? []).join("; "),
    names.fileAs,
    contact.org ?? "",
    contact.title ?? "",
    "",
    "",
    buildGoogleCsvNotes(contact),
    contact.photoUrl ?? "",
    buildGoogleCsvLabels(contact),
  ];

  for (let index = 0; index < maxEmails; index += 1) {
    const email = contact.emails?.[index];
    row.push(email ? googleEmailLabel(email) : "", email?.value ?? "");
  }

  for (let index = 0; index < maxPhones; index += 1) {
    const phone = contact.phones?.[index];
    row.push(
      phone ? googlePhoneLabel(phone) : "",
      phone ? formatPhoneExportValue(phone) : "",
    );
  }

  for (let index = 0; index < maxWebsites; index += 1) {
    const url = contact.urls?.[index];
    row.push(url ? "Profile" : "", url ?? "");
  }

  return row;
}

function exportVcard(contacts: Contact[]): ExportResult {
  const content = contacts.map((contact) => serializeContactVcard30(contact)).join("\r\n");

  return {
    filename: `mycontacts-${timestamp()}.vcf`,
    mimeType: "text/vcard;charset=utf-8",
    content,
  };
}

function csvEscape(value: string): string {
  let safe = value;
  if (/^[=+\-@\t\r]/.test(safe)) {
    safe = `'${safe}`;
  }
  if (/[",\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export { csvEscape };

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

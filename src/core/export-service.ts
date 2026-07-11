import {
  EmailProperty,
  FNProperty,
  KindProperty,
  NProperty,
  NoteProperty,
  OrgProperty,
  ProdidProperty,
  SpecialValueType,
  TelProperty,
  TextType,
  TitleProperty,
  UIDProperty,
  URLProperty,
  URIType,
  VCARD,
} from "vcard4";
import { contactDisplayName, contactPersonName } from "./contact-utils";
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
  return {
    filename: `mycontacts-${timestamp()}.json`,
    mimeType: "application/json",
    content: JSON.stringify(contacts, null, 2),
  };
}

function exportCsv(contacts: Contact[]): ExportResult {
  const headers = [
    "displayName",
    "givenName",
    "familyName",
    "alternateNames",
    "phones",
    "phoneRegions",
    "emails",
    "org",
    "title",
    "urls",
    "photoUrl",
    "notes",
    "source",
    "sourceId",
    "sourceUrl",
    "confidence",
    "extractedAt",
  ];

  const rows = contacts.map((contact) =>
    [
      contactPersonName(contact) ?? "",
      contact.givenName ?? "",
      contact.familyName ?? "",
      (contact.alternateNames ?? []).join("; "),
      (contact.phones ?? []).map((p) => p.e164 ?? p.value).join("; "),
      (contact.phones ?? []).map((p) => p.region ?? "").filter(Boolean).join("; "),
      (contact.emails ?? []).map((e) => e.value).join("; "),
      contact.org ?? "",
      contact.title ?? "",
      (contact.urls ?? []).join("; "),
      contact.photoUrl ?? "",
      contact.notes ?? "",
      contact.source,
      contact.sourceId ?? "",
      contact.sourceUrl ?? "",
      contact.confidence,
      contact.extractedAt,
    ]
      .map(csvEscape)
      .join(","),
  );

  return {
    filename: `mycontacts-${timestamp()}.csv`,
    mimeType: "text/csv",
    content: [headers.join(","), ...rows].join("\n"),
  };
}

function exportVcard(contacts: Contact[]): ExportResult {
  const cards = contacts.map((contact) => contactToVcard(contact).repr()).join("\r\n");

  return {
    filename: `mycontacts-${timestamp()}.vcf`,
    mimeType: "text/vcard",
    content: cards,
  };
}

function contactToVcard(contact: Contact): VCARD {
  const props = [
    new KindProperty([], new SpecialValueType("kindproperty", "individual")),
    new FNProperty([], new TextType(contactDisplayName(contact))),
    new UIDProperty([], new URIType(`urn:uuid:${contact.id}`)),
    new ProdidProperty([], new TextType("-//myCONTACTS//EN")),
  ];

  if (contact.givenName || contact.familyName) {
    props.push(
      new NProperty(
        [],
        new TextType(
          [contact.familyName ?? "", contact.givenName ?? "", "", "", ""].join(";"),
        ),
      ),
    );
  }

  for (const phone of contact.phones ?? []) {
    props.push(new TelProperty([], new URIType(`tel:${phone.e164 ?? phone.value}`)));
  }

  for (const email of contact.emails ?? []) {
    props.push(new EmailProperty([], new TextType(email.value)));
  }

  if (contact.org) {
    props.push(new OrgProperty([], new TextType(contact.org)));
  }

  if (contact.title) {
    props.push(new TitleProperty([], new TextType(contact.title)));
  }

  for (const url of contact.urls ?? []) {
    props.push(new URLProperty([], new URIType(url)));
  }

  const note = buildVcardNote(contact);
  if (note) {
    props.push(new NoteProperty([], new TextType(note)));
  }

  return new VCARD(props);
}

function buildVcardNote(contact: Contact): string | undefined {
  const parts: string[] = [];

  if (contact.notes) {
    parts.push(contact.notes);
  }

  if (contact.alternateNames?.length) {
    parts.push(`Also known as: ${contact.alternateNames.join(", ")}`);
  }

  if (contact.sourceId) {
    parts.push(`WhatsApp ID: ${contact.sourceId}`);
  }

  if (contact.photoUrl) {
    parts.push(`Photo: ${contact.photoUrl}`);
  }

  return parts.length ? parts.join("\n") : undefined;
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

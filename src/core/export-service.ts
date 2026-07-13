import {
  CategoriesProperty,
  DateTimeType,
  EmailProperty,
  FNProperty,
  KindProperty,
  NicknameProperty,
  NoteProperty,
  OrgProperty,
  ParameterValueType,
  PhotoProperty,
  ProdidProperty,
  RevProperty,
  SourceProperty,
  SpecialValueType,
  TelProperty,
  TextListType,
  TextType,
  TitleProperty,
  TypeParameter,
  UIDProperty,
  URLProperty,
  URIType,
  VCARD,
} from "vcard4";
import { contactDisplayName } from "./contact-utils";
import {
  buildGoogleCsvHeaders,
  buildGoogleCsvLabels,
  buildGoogleCsvNotes,
  buildJcardNComponent,
  countGoogleCsvSlots,
  formatPhoneExportValue,
  formatTelUri,
  formatVcardNLine,
  googleEmailLabel,
  googlePhoneLabel,
  injectJcardNComponent,
  injectVcardNLine,
  resolveExportNameFields,
  toVcardTimestamp,
  vcardEmailType,
  vcardPhoneType,
} from "./export-standards";
import type { Contact, ContactEmail, ContactPhone, ExportFormat } from "./types";

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
  const jcards = contacts.map((contact) => {
    const jcard = contactToVcard(contact).reprJSON();
    return injectJcardNComponent(jcard, buildJcardNComponent(contact));
  });

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
  const cards = contacts
    .map((contact) => injectVcardNLine(contactToVcard(contact).repr(), formatVcardNLine(contact)))
    .join("\r\n");

  return {
    filename: `mycontacts-${timestamp()}.vcf`,
    mimeType: "text/vcard;charset=utf-8",
    content: cards,
  };
}

function contactToVcard(contact: Contact): VCARD {
  const props = [
    new KindProperty([], new SpecialValueType("kindproperty", "individual")),
    new FNProperty([], new TextType(contactDisplayName(contact))),
    new UIDProperty([], new URIType(`urn:uuid:${contact.id}`)),
    new ProdidProperty([], new TextType("-//myCONTACTS//EN")),
    new RevProperty([], new DateTimeType("timestamp", toVcardTimestamp(contact.extractedAt))),
  ];

  const nicknames = (contact.alternateNames ?? [])
    .map((name) => name.trim())
    .filter(Boolean);
  if (nicknames.length === 1) {
    props.push(new NicknameProperty([], new TextType(nicknames[0]!)));
  } else if (nicknames.length > 1) {
    props.push(
      new NicknameProperty(
        [],
        new TextListType(nicknames.map((name) => new TextType(name))),
      ),
    );
  }

  for (const phone of contact.phones ?? []) {
    props.push(buildTelProperty(phone));
  }

  for (const email of contact.emails ?? []) {
    props.push(buildEmailProperty(email));
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

  if (contact.photoUrl) {
    props.push(new PhotoProperty([], new URIType(contact.photoUrl)));
  }

  if (contact.sourceUrl) {
    props.push(new SourceProperty([], new URIType(contact.sourceUrl)));
  }

  props.push(
    new CategoriesProperty(
      [],
      new TextListType([
        new TextType("myCONTACTS"),
        new TextType(contact.source),
      ]),
    ),
  );

  const note = buildVcardNote(contact);
  if (note) {
    props.push(new NoteProperty([], new TextType(note)));
  }

  return new VCARD(props);
}

function buildTelProperty(phone: ContactPhone): TelProperty {
  const type = vcardPhoneType(phone);
  return new TelProperty(
    [new TypeParameter("TelProperty", new ParameterValueType(type))],
    new URIType(formatTelUri(phone)),
  );
}

function buildEmailProperty(email: ContactEmail): EmailProperty {
  const type = vcardEmailType(email);
  const params = type
    ? [new TypeParameter("EmailProperty", new ParameterValueType(type))]
    : [];

  return new EmailProperty(params, new TextType(email.value));
}

function buildVcardNote(contact: Contact): string | undefined {
  const parts: string[] = [];

  if (contact.notes?.trim()) {
    parts.push(contact.notes.trim());
  }

  if (contact.sourceId?.trim()) {
    parts.push(`Source ID: ${contact.sourceId.trim()}`);
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

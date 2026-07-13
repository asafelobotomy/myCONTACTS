import type { CountryCode } from "libphonenumber-js";
import { isSupportedCountry } from "libphonenumber-js";
import type { Contact, ContactConfidence, ExportFormat } from "./types";

export const MAX_CONTACTS_PER_SAVE = 5_000;
export const MAX_STRING_FIELD_LENGTH = 2_000;
export const MAX_URLS_PER_CONTACT = 50;
export const MAX_PHONES_PER_CONTACT = 20;
export const MAX_EMAILS_PER_CONTACT = 20;

const VALID_CONFIDENCE: ReadonlySet<ContactConfidence> = new Set([
  "structured",
  "dom",
  "regex",
  "inferred",
]);

const VALID_EXPORT_FORMATS: ReadonlySet<ExportFormat> = new Set(["csv", "vcard", "json"]);

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateContacts(input: unknown): Contact[] {
  if (!Array.isArray(input)) {
    throw new ValidationError("Contacts payload must be an array.");
  }

  if (input.length > MAX_CONTACTS_PER_SAVE) {
    throw new ValidationError(`Cannot save more than ${MAX_CONTACTS_PER_SAVE} contacts at once.`);
  }

  return input.map((entry, index) => validateContact(entry, index));
}

function validateContact(input: unknown, index: number): Contact {
  if (!input || typeof input !== "object") {
    throw new ValidationError(`Contact at index ${index} must be an object.`);
  }

  const record = input as Record<string, unknown>;
  const id = requireString(record.id, `contacts[${index}].id`);
  const source = requireString(record.source, `contacts[${index}].source`);
  const extractedAt = requireString(record.extractedAt, `contacts[${index}].extractedAt`);
  const confidence = record.confidence;

  if (typeof confidence !== "string" || !VALID_CONFIDENCE.has(confidence as ContactConfidence)) {
    throw new ValidationError(`contacts[${index}].confidence is invalid.`);
  }

  return {
    id,
    source,
    extractedAt,
    confidence: confidence as ContactConfidence,
    sourceUrl: optionalString(record.sourceUrl, `contacts[${index}].sourceUrl`),
    displayName: optionalString(record.displayName, `contacts[${index}].displayName`),
    givenName: optionalString(record.givenName, `contacts[${index}].givenName`),
    familyName: optionalString(record.familyName, `contacts[${index}].familyName`),
    org: optionalString(record.org, `contacts[${index}].org`),
    title: optionalString(record.title, `contacts[${index}].title`),
    photoUrl: optionalString(record.photoUrl, `contacts[${index}].photoUrl`),
    notes: optionalString(record.notes, `contacts[${index}].notes`),
    sourceId: optionalString(record.sourceId, `contacts[${index}].sourceId`),
    alternateNames: optionalStringArray(record.alternateNames, `contacts[${index}].alternateNames`),
    phones: optionalPhones(record.phones, index),
    emails: optionalEmails(record.emails, index),
    urls: optionalUrls(record.urls, index),
  };
}

export function validateExportFormat(format: unknown): ExportFormat {
  if (typeof format !== "string" || !VALID_EXPORT_FORMATS.has(format as ExportFormat)) {
    throw new ValidationError("Export format is invalid.");
  }
  return format as ExportFormat;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${field} must be a non-empty string.`);
  }
  return truncate(value.trim(), field);
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  return trimmed ? truncate(trimmed, field) : undefined;
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ValidationError(`${field} must be an array.`);
  }

  return value.map((entry, entryIndex) =>
    requireString(entry, `${field}[${entryIndex}]`),
  );
}

function optionalPhones(value: unknown, index: number): Contact["phones"] {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ValidationError(`contacts[${index}].phones must be an array.`);
  }
  if (value.length > MAX_PHONES_PER_CONTACT) {
    throw new ValidationError(`contacts[${index}] exceeds the phone limit.`);
  }

  return value.map((entry, phoneIndex) => {
    if (!entry || typeof entry !== "object") {
      throw new ValidationError(`contacts[${index}].phones[${phoneIndex}] must be an object.`);
    }
    const phone = entry as Record<string, unknown>;
    const phoneValue = requireString(phone.value, `contacts[${index}].phones[${phoneIndex}].value`);
    const region = optionalString(phone.region, `contacts[${index}].phones[${phoneIndex}].region`);
    return {
      value: phoneValue,
      e164: optionalString(phone.e164, `contacts[${index}].phones[${phoneIndex}].e164`),
      type: optionalString(phone.type, `contacts[${index}].phones[${phoneIndex}].type`),
      region: region && isSupportedCountry(region.toUpperCase()) ? (region.toUpperCase() as CountryCode) : undefined,
    };
  });
}

function optionalEmails(value: unknown, index: number): Contact["emails"] {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ValidationError(`contacts[${index}].emails must be an array.`);
  }
  if (value.length > MAX_EMAILS_PER_CONTACT) {
    throw new ValidationError(`contacts[${index}] exceeds the email limit.`);
  }

  return value.map((entry, emailIndex) => {
    if (!entry || typeof entry !== "object") {
      throw new ValidationError(`contacts[${index}].emails[${emailIndex}] must be an object.`);
    }
    const email = entry as Record<string, unknown>;
    return {
      value: requireString(email.value, `contacts[${index}].emails[${emailIndex}].value`),
      type: optionalString(email.type, `contacts[${index}].emails[${emailIndex}].type`),
    };
  });
}

function optionalUrls(value: unknown, index: number): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ValidationError(`contacts[${index}].urls must be an array.`);
  }
  if (value.length > MAX_URLS_PER_CONTACT) {
    throw new ValidationError(`contacts[${index}] exceeds the URL limit.`);
  }

  return value.map((entry, urlIndex) =>
    requireString(entry, `contacts[${index}].urls[${urlIndex}]`),
  );
}

function truncate(value: string, field: string): string {
  if (value.length <= MAX_STRING_FIELD_LENGTH) {
    return value;
  }
  throw new ValidationError(`${field} exceeds ${MAX_STRING_FIELD_LENGTH} characters.`);
}

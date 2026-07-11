import {
  formatPhone,
  humanDisplayName,
  isBlockedDisplayName,
  isGroupJid,
  isGroupRecord,
  isIndividualContactJid,
  normalizePhoneDigits,
  phoneDigitsFromJid,
} from "./whatsapp-contacts";

export interface RawIndexedDbContact {
  savedName?: string;
  pushname?: string;
  verifiedName?: string;
  shortName?: string;
  formattedName?: string;
  notifyName?: string;
  mentionName?: string;
  displayName?: string;
  phone?: string;
  id?: string;
  email?: string;
  org?: string;
  title?: string;
  website?: string;
  status?: string;
  photoUrl?: string;
  labels?: string[];
}

const KNOWN_WHATSAPP_DATABASES = [
  "model-storage",
  "wawc",
  "lru-media-storage-idb",
  "wweb-db",
  "wa-web-db",
] as const;

const MAX_RECORDS_PER_STORE = 5_000;
const MAX_TOTAL_CONTACTS = 10_000;
const MAX_RECURSION_DEPTH = 6;

const SAVED_NAME_KEYS = ["name"] as const;
const PUSHNAME_KEYS = ["pushname"] as const;
const VERIFIED_NAME_KEYS = ["verifiedName", "searchVerifiedName"] as const;
const SHORT_NAME_KEYS = ["shortName", "formattedShortName"] as const;
const FORMATTED_NAME_KEYS = ["formattedName", "formattedUser"] as const;
const NOTIFY_NAME_KEYS = ["notifyName", "displayName", "searchName", "premiumMessageName"] as const;
const MENTION_NAME_KEYS = ["mentionName"] as const;
const ID_KEYS = ["id", "wid", "_id", "user"] as const;
const PHONE_KEYS = ["phone", "number", "formattedPhone", "e164", "pnForLid", "phoneNumber"] as const;
const EMAIL_KEYS = ["email", "businessEmail"] as const;
const ORG_KEYS = ["businessName", "companyName", "org"] as const;
const TITLE_KEYS = ["category", "description", "title"] as const;
const WEBSITE_KEYS = ["website", "bizWebsite", "url"] as const;
const STATUS_KEYS = ["status", "about"] as const;
const PHOTO_KEYS = ["eurl", "imgUrl", "imgFull", "url", "img"] as const;
const LABEL_KEYS = ["labels"] as const;
const NESTED_PROFILE_KEYS = ["businessProfile", "profilePicThumb", "profilePicThumbObj"] as const;

export async function readWhatsAppIndexedDbContacts(): Promise<RawIndexedDbContact[]> {
  if (!("indexedDB" in globalThis)) {
    return [];
  }

  const contacts: RawIndexedDbContact[] = [];

  for (const dbName of KNOWN_WHATSAPP_DATABASES) {
    if (contacts.length >= MAX_TOTAL_CONTACTS) {
      break;
    }

    try {
      const records = await readDatabaseRecords(dbName);
      for (const record of records) {
        contacts.push(...extractContactsFromRecord(record));
        if (contacts.length >= MAX_TOTAL_CONTACTS) {
          break;
        }
      }
    } catch {
      continue;
    }
  }

  return consolidateRawContacts(contacts.slice(0, MAX_TOTAL_CONTACTS));
}

export function consolidateRawContacts(entries: RawIndexedDbContact[]): RawIndexedDbContact[] {
  const byPhone = new Map<string, RawIndexedDbContact>();

  for (const entry of entries) {
    const phoneDigits = phoneDigitsFromEntry(entry);
    if (!phoneDigits) {
      continue;
    }

    const existing = byPhone.get(phoneDigits);
    if (existing) {
      byPhone.set(phoneDigits, mergeRawContact(existing, entry, phoneDigits));
    } else {
      byPhone.set(phoneDigits, normalizeRawContact(entry, phoneDigits));
    }
  }

  return Array.from(byPhone.values());
}

async function readDatabaseRecords(dbName: string): Promise<unknown[]> {
  return new Promise((resolve) => {
    const request = indexedDB.open(dbName);
    request.onerror = () => resolve([]);
    request.onsuccess = () => {
      const db = request.result;
      void scanDatabase(db)
        .then(resolve)
        .catch(() => resolve([]))
        .finally(() => db.close());
    };
  });
}

async function scanDatabase(db: IDBDatabase): Promise<unknown[]> {
  const records: unknown[] = [];
  const storeNames = Array.from(db.objectStoreNames);

  for (const storeName of storeNames) {
    if (records.length >= MAX_RECORDS_PER_STORE) {
      break;
    }
    const storeRecords = await readObjectStore(db, storeName);
    records.push(...storeRecords.slice(0, MAX_RECORDS_PER_STORE - records.length));
  }

  return records;
}

function readObjectStore(db: IDBDatabase, storeName: string): Promise<unknown[]> {
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onerror = () => resolve([]);
    request.onsuccess = () => {
      const result = (request.result as unknown[]) ?? [];
      resolve(result.slice(0, MAX_RECORDS_PER_STORE));
    };
  });
}

function extractContactsFromRecord(record: unknown, depth = 0): RawIndexedDbContact[] {
  if (depth > MAX_RECURSION_DEPTH || record == null) {
    return [];
  }

  if (typeof record === "string") {
    return extractFromString(record);
  }

  if (Array.isArray(record)) {
    return record.flatMap((entry) => extractContactsFromRecord(entry, depth + 1));
  }

  if (typeof record !== "object") {
    return [];
  }

  const obj = record as Record<string, unknown>;
  if (isGroupRecord(obj)) {
    return [];
  }

  const contacts: RawIndexedDbContact[] = [];
  const coalesced = coalesceContactFields(obj);

  if (coalesced && isContactModel(coalesced)) {
    contacts.push(coalesced);
  }

  for (const value of Object.values(obj)) {
    if (typeof value === "object" && value !== null) {
      contacts.push(...extractContactsFromRecord(value, depth + 1));
    } else if (typeof value === "string" && !isGroupJid(value)) {
      contacts.push(...extractFromString(value));
    }
    if (contacts.length >= MAX_TOTAL_CONTACTS) {
      break;
    }
  }

  return contacts;
}

function coalesceContactFields(obj: Record<string, unknown>): RawIndexedDbContact | null {
  if (isGroupRecord(obj)) {
    return null;
  }

  const sources = collectContactSources(obj);
  const merged: RawIndexedDbContact = {};

  for (const source of sources) {
    mergeRawFields(merged, extractRawFields(source));
  }

  if (merged.id && isGroupJid(merged.id)) {
    return null;
  }

  return Object.keys(merged).length ? merged : null;
}

function collectContactSources(obj: Record<string, unknown>): Record<string, unknown>[] {
  const sources: Record<string, unknown>[] = [obj];

  for (const value of Object.values(obj)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sources.push(value as Record<string, unknown>);
    }
  }

  for (const key of NESTED_PROFILE_KEYS) {
    const nested = obj[key];
    if (typeof nested === "object" && nested !== null && !Array.isArray(nested)) {
      sources.push(nested as Record<string, unknown>);
    }
  }

  return sources;
}

function extractRawFields(obj: Record<string, unknown>): RawIndexedDbContact {
  return {
    savedName: humanDisplayName(pickString(obj, SAVED_NAME_KEYS)),
    pushname: humanDisplayName(pickString(obj, PUSHNAME_KEYS)),
    verifiedName: humanDisplayName(pickString(obj, VERIFIED_NAME_KEYS)),
    shortName: humanDisplayName(pickString(obj, SHORT_NAME_KEYS)),
    formattedName: humanDisplayName(pickString(obj, FORMATTED_NAME_KEYS)),
    notifyName: humanDisplayName(pickString(obj, NOTIFY_NAME_KEYS)),
    mentionName: humanDisplayName(pickString(obj, MENTION_NAME_KEYS)),
    phone: pickPhone(obj),
    id: pickContactJid(obj),
    email: pickString(obj, EMAIL_KEYS),
    org: pickString(obj, ORG_KEYS),
    title: pickString(obj, TITLE_KEYS),
    website: pickWebsite(obj),
    status: pickString(obj, STATUS_KEYS),
    photoUrl: pickPhotoUrl(obj),
    labels: pickStringLabels(obj),
  };
}

function mergeRawFields(target: RawIndexedDbContact, incoming: RawIndexedDbContact): void {
  target.savedName = pickBestRawName(target.savedName, incoming.savedName);
  target.pushname = pickBestRawName(target.pushname, incoming.pushname);
  target.verifiedName = pickBestRawName(target.verifiedName, incoming.verifiedName);
  target.shortName = pickBestRawName(target.shortName, incoming.shortName);
  target.formattedName = pickBestRawName(target.formattedName, incoming.formattedName);
  target.notifyName = pickBestRawName(target.notifyName, incoming.notifyName);
  target.mentionName = pickBestRawName(target.mentionName, incoming.mentionName);
  target.phone = target.phone ?? incoming.phone;
  target.id = target.id ?? incoming.id;
  target.email = target.email ?? incoming.email;
  target.org = target.org ?? incoming.org;
  target.title = target.title ?? incoming.title;
  target.website = target.website ?? incoming.website;
  target.status = target.status ?? incoming.status;
  target.photoUrl = target.photoUrl ?? incoming.photoUrl;
  target.labels = uniqueStrings([...(target.labels ?? []), ...(incoming.labels ?? [])]);
}

function isContactModel(contact: RawIndexedDbContact): boolean {
  if (contact.id && isGroupJid(contact.id)) {
    return false;
  }

  if (!phoneDigitsFromEntry(contact)) {
    return false;
  }

  const primaryName = pickPrimaryRawName(contact);
  if (primaryName && isBlockedDisplayName(primaryName)) {
    return false;
  }

  return true;
}

function extractFromString(value: string): RawIndexedDbContact[] {
  const phoneDigits = phoneDigitsFromJid(value);
  if (!phoneDigits) {
    return [];
  }

  return [{ phone: formatPhone(phoneDigits), id: value.includes("@") ? value : undefined }];
}

function pickString(obj: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function pickContactJid(obj: Record<string, unknown>): string | undefined {
  for (const key of ID_KEYS) {
    const value = obj[key];
    if (typeof value === "string" && isStoredContactJid(value)) {
      return value;
    }
  }
  return undefined;
}

function isStoredContactJid(value: string): boolean {
  return !isGroupJid(value) && (isIndividualContactJid(value) || value.includes("@lid"));
}

function pickPhone(obj: Record<string, unknown>): string | undefined {
  const direct = pickString(obj, PHONE_KEYS);
  if (direct) {
    const digits = phoneDigitsFromJid(direct) ?? normalizePhoneDigits(direct);
    return digits ? formatPhone(digits) : undefined;
  }

  for (const value of Object.values(obj)) {
    if (typeof value !== "string") {
      continue;
    }

    const digits = phoneDigitsFromJid(value);
    if (digits) {
      return formatPhone(digits);
    }
  }

  return undefined;
}

function pickWebsite(obj: Record<string, unknown>): string | undefined {
  const direct = pickString(obj, WEBSITE_KEYS);
  if (direct && /^https?:\/\//i.test(direct)) {
    return direct;
  }

  return undefined;
}

function pickPhotoUrl(obj: Record<string, unknown>): string | undefined {
  for (const key of PHOTO_KEYS) {
    const value = obj[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      return value;
    }
  }

  return undefined;
}

function pickStringLabels(obj: Record<string, unknown>): string[] | undefined {
  for (const key of LABEL_KEYS) {
    const value = obj[key];
    if (!Array.isArray(value)) {
      continue;
    }

    const labels = value
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => entry.trim());

    if (labels.length) {
      return labels;
    }
  }

  return undefined;
}

function mergeRawContact(
  existing: RawIndexedDbContact,
  incoming: RawIndexedDbContact,
  phoneDigits: string,
): RawIndexedDbContact {
  const merged: RawIndexedDbContact = { ...existing };
  mergeRawFields(merged, incoming);
  merged.phone = formatPhone(phoneDigits);
  return merged;
}

function normalizeRawContact(entry: RawIndexedDbContact, phoneDigits: string): RawIndexedDbContact {
  return {
    ...entry,
    phone: formatPhone(phoneDigits),
  };
}

function phoneDigitsFromEntry(entry: RawIndexedDbContact): string | undefined {
  const fromId = phoneDigitsFromJid(entry.id);
  if (fromId) {
    return fromId;
  }

  if (!entry.phone) {
    return undefined;
  }

  return normalizePhoneDigits(entry.phone);
}

function pickPrimaryRawName(contact: RawIndexedDbContact): string | undefined {
  return (
    contact.savedName ??
    contact.verifiedName ??
    contact.formattedName ??
    contact.pushname ??
    contact.shortName ??
    contact.notifyName ??
    contact.mentionName
  );
}

function pickBestRawName(existing?: string, incoming?: string): string | undefined {
  const candidates = [existing, incoming]
    .map((value) => humanDisplayName(value))
    .filter((value): value is string => Boolean(value));

  if (!candidates.length) {
    return undefined;
  }

  return candidates.sort((left, right) => scoreRawName(right) - scoreRawName(left))[0];
}

function scoreRawName(value: string): number {
  let score = value.trim().length;
  if (/\s/.test(value)) {
    score += 10;
  }
  return score;
}

function uniqueStrings(values: string[]): string[] | undefined {
  const unique = Array.from(new Set(values.filter(Boolean)));
  return unique.length ? unique : undefined;
}

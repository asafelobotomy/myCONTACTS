import {
  decryptLibrary,
  encodeBase64,
  encryptLibrary,
  generateSalt,
  decodeBase64,
  type EncryptedLibraryPayload,
} from "./crypto";
import { getSessionPassphrase, restoreSessionPassphrase, setSessionPassphrase, clearSessionPassphrase } from "./crypto-session";
import { mergeContacts } from "./contact-utils";
import { resolvePhoneRegion } from "./phone-region";
import type { Contact, ExtensionSettings, StoredContactLibrary } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { validateContacts } from "./validation";

const LIBRARY_KEY = "contactLibrary";
const SETTINGS_KEY = "settings";
const DB_NAME = "mycontacts-library";
const DB_VERSION = 2;
const STORE_NAME = "contacts";
const META_STORE = "meta";
const META_LIBRARY_KEY = "library";

export const CONTACT_LIBRARY_STORAGE_KEYS = [LIBRARY_KEY] as const;
export const CONTACT_LIBRARY_DB_NAME = DB_NAME;

export class LibraryLockedError extends Error {
  constructor() {
    super("Library is encrypted. Unlock it with your passphrase.");
    this.name = "LibraryLockedError";
  }
}

interface LibraryMetaRecord {
  version: 1;
  updatedAt: string;
  encryptionEnabled: boolean;
  salt?: string;
  encryptedPayload?: EncryptedLibraryPayload;
}

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    defaultPhoneRegion: resolvePhoneRegion(stored?.defaultPhoneRegion),
    enabledPlatforms: {
      ...DEFAULT_SETTINGS.enabledPlatforms,
      ...stored?.enabledPlatforms,
    },
  };
}

export async function updateSettings(partial: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const current = await getSettings();
  const next: ExtensionSettings = {
    ...current,
    ...partial,
    defaultPhoneRegion: partial.defaultPhoneRegion
      ? resolvePhoneRegion(partial.defaultPhoneRegion)
      : current.defaultPhoneRegion,
    enabledPlatforms: {
      ...current.enabledPlatforms,
      ...partial.enabledPlatforms,
    },
  };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function getLibrary(): Promise<StoredContactLibrary> {
  await restoreSessionPassphrase();
  const settings = await getSettings();

  if (settings.libraryEncryptionEnabled) {
    return readEncryptedLibrary();
  }

  const indexed = await readIndexedDbLibrary();
  if (indexed.contacts.length) {
    return indexed;
  }

  const migrated = await migrateLegacyChromeStorageLibrary();
  if (migrated) {
    return migrated;
  }

  return emptyLibrary();
}

export async function saveToLibrary(incoming: Contact[]): Promise<StoredContactLibrary> {
  const validated = validateContacts(incoming);
  const settings = await getSettings();
  const current = await getLibrary();
  const merged = mergeContacts(current.contacts, validated);
  const next = {
    version: 1 as const,
    updatedAt: new Date().toISOString(),
    contacts: merged,
  };

  if (settings.libraryEncryptionEnabled) {
    await writeEncryptedLibrary(merged, next.updatedAt);
  } else {
    await writeIndexedDbLibraryIncremental(current.contacts, merged, next.updatedAt);
  }

  return next;
}

export async function clearLibrary(): Promise<StoredContactLibrary> {
  await purgeAllContactData();

  const settings = await getSettings();
  if (settings.libraryEncryptionEnabled) {
    await updateSettings({ libraryEncryptionEnabled: false });
  }

  return emptyLibrary();
}

export async function purgeAllContactData(): Promise<void> {
  await purgeIndexedDbLibrary();
  await purgeLegacyChromeStorage();
  await setSessionPassphrase(null);
  clearSessionPassphrase();
}

export async function unlockLibrary(passphrase: string): Promise<StoredContactLibrary> {
  const meta = await readLibraryMeta();
  if (!meta?.encryptionEnabled || !meta.encryptedPayload || !meta.salt) {
    throw new Error("Library encryption is not enabled.");
  }

  await decryptLibrary(meta.encryptedPayload, passphrase, decodeBase64(meta.salt));
  await setSessionPassphrase(passphrase);
  return getLibrary();
}

export async function setLibraryEncryption(
  enabled: boolean,
  passphrase: string,
): Promise<StoredContactLibrary> {
  if (!passphrase.trim()) {
    throw new Error("Passphrase is required.");
  }

  const settings = await getSettings();
  const current = await getLibrary();

  if (enabled) {
    const salt = generateSalt();
    const encryptedPayload = await encryptLibrary(current.contacts, passphrase, salt);
    await clearIndexedDbContacts();
    await writeLibraryMeta({
      version: 1,
      updatedAt: new Date().toISOString(),
      encryptionEnabled: true,
      salt: encodeBase64(salt),
      encryptedPayload,
    });
    await chrome.storage.local.remove(LIBRARY_KEY);
    await updateSettings({ libraryEncryptionEnabled: true });
    await setSessionPassphrase(passphrase);
    return current;
  }

  if (!settings.libraryEncryptionEnabled) {
    return current;
  }

  const meta = await readLibraryMeta();
  if (!meta?.encryptedPayload || !meta.salt) {
    throw new Error("Encrypted library metadata is missing.");
  }

  const contacts = await decryptLibrary(meta.encryptedPayload, passphrase, decodeBase64(meta.salt));
  await clearIndexedDbContacts();
  await writeIndexedDbLibraryIncremental([], contacts, new Date().toISOString());
  await writeLibraryMeta({
    version: 1,
    updatedAt: new Date().toISOString(),
    encryptionEnabled: false,
  });
  await updateSettings({ libraryEncryptionEnabled: false });
  await setSessionPassphrase(null);
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    contacts,
  };
}

export async function lockLibrary(): Promise<void> {
  await setSessionPassphrase(null);
  clearSessionPassphrase();
}

function emptyLibrary(): StoredContactLibrary {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    contacts: [],
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Failed to open library database"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function migrateLegacyChromeStorageLibrary(): Promise<StoredContactLibrary | null> {
  const result = await chrome.storage.local.get(LIBRARY_KEY);
  const stored = result[LIBRARY_KEY] as StoredContactLibrary | undefined;
  if (!stored?.contacts?.length) {
    return null;
  }

  await writeIndexedDbLibraryIncremental([], stored.contacts, stored.updatedAt);
  await chrome.storage.local.remove(LIBRARY_KEY);
  return stored;
}

async function readEncryptedLibrary(): Promise<StoredContactLibrary> {
  const meta = await readLibraryMeta();
  if (!meta?.encryptionEnabled || !meta.encryptedPayload || !meta.salt) {
    return emptyLibrary();
  }

  const passphrase = getSessionPassphrase();
  if (!passphrase) {
    throw new LibraryLockedError();
  }

  const contacts = await decryptLibrary(meta.encryptedPayload, passphrase, decodeBase64(meta.salt));
  return {
    version: 1,
    updatedAt: meta.updatedAt,
    contacts,
  };
}

async function writeEncryptedLibrary(contacts: Contact[], updatedAt: string): Promise<void> {
  const meta = await readLibraryMeta();
  const passphrase = getSessionPassphrase();
  if (!passphrase) {
    throw new LibraryLockedError();
  }

  const salt = meta?.salt ? decodeBase64(meta.salt) : generateSalt();
  const encryptedPayload = await encryptLibrary(contacts, passphrase, salt);

  await writeLibraryMeta({
    version: 1,
    updatedAt,
    encryptionEnabled: true,
    salt: encodeBase64(salt),
    encryptedPayload,
  });
}

async function readLibraryMeta(): Promise<LibraryMetaRecord | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const store = tx.objectStore(META_STORE);
    const request = store.get(META_LIBRARY_KEY);
    request.onerror = () => reject(request.error ?? new Error("Failed to read library metadata"));
    request.onsuccess = () => resolve((request.result as LibraryMetaRecord | undefined) ?? null);
    tx.oncomplete = () => db.close();
  });
}

async function writeLibraryMeta(meta: LibraryMetaRecord): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    const store = tx.objectStore(META_STORE);
    const request = store.put(meta, META_LIBRARY_KEY);
    request.onerror = () => reject(request.error ?? new Error("Failed to write library metadata"));
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("Failed to write library metadata"));
  });
}

async function readIndexedDbLibrary(): Promise<StoredContactLibrary> {
  const db = await openDatabase();
  const contacts = await new Promise<Contact[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error ?? new Error("Failed to read library"));
    request.onsuccess = () => resolve((request.result as Contact[]) ?? []);
    tx.oncomplete = () => db.close();
  });
  const meta = await readLibraryMeta();
  return {
    version: 1,
    updatedAt: meta?.updatedAt ?? new Date().toISOString(),
    contacts,
  };
}

async function writeIndexedDbLibraryIncremental(
  previous: Contact[],
  merged: Contact[],
  updatedAt: string,
): Promise<void> {
  const previousIds = new Set(previous.map((contact) => contact.id));
  const mergedIds = new Set(merged.map((contact) => contact.id));
  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, META_STORE], "readwrite");
    const contactStore = tx.objectStore(STORE_NAME);
    const metaStore = tx.objectStore(META_STORE);

    for (const contact of merged) {
      contactStore.put(contact);
    }

    for (const id of previousIds) {
      if (!mergedIds.has(id)) {
        contactStore.delete(id);
      }
    }

    metaStore.put(
      {
        version: 1,
        updatedAt,
        encryptionEnabled: false,
      } satisfies LibraryMetaRecord,
      META_LIBRARY_KEY,
    );

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("Failed to write library"));
  });
}

async function clearIndexedDbContacts(): Promise<void> {
  await clearObjectStore(STORE_NAME);
}

async function clearIndexedDbMeta(): Promise<void> {
  await clearObjectStore(META_STORE);
}

async function clearObjectStore(storeName: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onerror = () => reject(request.error ?? new Error(`Failed to clear ${storeName}`));
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error(`Failed to clear ${storeName}`));
  });
}

async function purgeIndexedDbLibrary(): Promise<void> {
  try {
    await clearIndexedDbContacts();
    await clearIndexedDbMeta();
  } catch {
    // Database may not exist yet on first run.
  }

  await deleteLibraryDatabase();
}

async function deleteLibraryDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onerror = () => reject(request.error ?? new Error("Failed to delete library database"));
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
  }).catch(() => undefined);
}

async function purgeLegacyChromeStorage(): Promise<void> {
  await chrome.storage.local.remove([...CONTACT_LIBRARY_STORAGE_KEYS]);
}

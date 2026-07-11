import type { CountryCode } from "libphonenumber-js";
import type { ExtractionOptions } from "./extraction-options";

export type ContactConfidence = "structured" | "dom" | "regex" | "inferred";

export interface ContactPhone {
  value: string;
  type?: string;
  e164?: string;
  region?: CountryCode;
}

export interface ContactEmail {
  value: string;
  type?: string;
}

export interface Contact {
  id: string;
  source: string;
  sourceUrl?: string;
  sourceId?: string;
  displayName?: string;
  givenName?: string;
  familyName?: string;
  alternateNames?: string[];
  phones?: ContactPhone[];
  emails?: ContactEmail[];
  org?: string;
  title?: string;
  urls?: string[];
  photoUrl?: string;
  notes?: string;
  extractedAt: string;
  confidence: ContactConfidence;
}

export type ExportFormat = "csv" | "vcard" | "json";

export type PlatformId =
  | "whatsapp-web"
  | "discord-web"
  | "telegram-web"
  | "linkedin"
  | "generic-web";

export type PlatformToggles = Record<PlatformId, boolean>;

export const DEFAULT_PLATFORM_TOGGLES: PlatformToggles = {
  "whatsapp-web": true,
  "discord-web": true,
  "telegram-web": true,
  linkedin: true,
  "generic-web": true,
};

export interface ExtractContext {
  document: Document;
  url: URL;
  window?: Window;
  options: ExtractionOptions;
}

export interface SiteAdapter {
  id: string;
  adapterVersion: string;
  match(url: URL): boolean;
  extract(ctx: ExtractContext): Promise<Contact[]>;
}

export interface ExtractionResult {
  adapterId: string;
  adapterVersion: string;
  contacts: Contact[];
  warnings?: string[];
}

export interface StoredContactLibrary {
  version: 1;
  updatedAt: string;
  contacts: Contact[];
}

export interface ExtensionSettings {
  autoSaveToLibrary: boolean;
  defaultExportFormat: ExportFormat;
  defaultPhoneRegion: CountryCode;
  enableRegexFallback: boolean;
  enabledPlatforms: PlatformToggles;
  includeUnnamedContacts: boolean;
  libraryEncryptionEnabled: boolean;
  acceptedDisclaimer: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  autoSaveToLibrary: true,
  defaultExportFormat: "csv",
  defaultPhoneRegion: "US",
  enableRegexFallback: false,
  enabledPlatforms: { ...DEFAULT_PLATFORM_TOGGLES },
  includeUnnamedContacts: false,
  libraryEncryptionEnabled: false,
  acceptedDisclaimer: false,
};

export type BackgroundRequestMessage =
  | { type: "EXTRACT_CONTACTS" }
  | { type: "GET_LIBRARY" }
  | { type: "SAVE_TO_LIBRARY"; payload: Contact[] }
  | { type: "CLEAR_LIBRARY" }
  | { type: "GET_SETTINGS" }
  | { type: "UPDATE_SETTINGS"; payload: Partial<ExtensionSettings> }
  | { type: "EXPORT_CONTACTS"; payload: { contacts: Contact[]; format: ExportFormat } }
  | { type: "UNLOCK_LIBRARY"; payload: { passphrase: string } }
  | { type: "SET_LIBRARY_ENCRYPTION"; payload: { enabled: boolean; passphrase: string } }
  | { type: "LOCK_LIBRARY" };

export type ContentScriptMessage =
  | { type: "PING" }
  | {
      type: "EXTRACT_CONTACTS";
      payload: ExtractionOptions;
    };

export type MessageType =
  | BackgroundRequestMessage
  | ContentScriptMessage
  | { type: "PONG" }
  | { type: "EXTRACTION_RESULT"; payload: ExtractionResult }
  | { type: "LIBRARY_RESULT"; payload: StoredContactLibrary }
  | { type: "LIBRARY_LOCKED" }
  | { type: "SETTINGS_RESULT"; payload: ExtensionSettings }
  | { type: "EXPORT_RESULT"; payload: { filename: string; mimeType: string; content: string } }
  | { type: "ERROR"; payload: string };

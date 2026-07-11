import type { CountryCode } from "libphonenumber-js";
import type { ExtensionSettings } from "./types";
import { DEFAULT_PLATFORM_TOGGLES } from "./types";

export interface ExtractionOptions {
  enableRegexFallback: boolean;
  enabledPlatforms: Record<string, boolean>;
  maxRegexPageChars: number;
  defaultPhoneRegion: CountryCode;
  includeUnnamedContacts: boolean;
}

export const DEFAULT_EXTRACTION_OPTIONS: ExtractionOptions = {
  enableRegexFallback: false,
  enabledPlatforms: { ...DEFAULT_PLATFORM_TOGGLES },
  maxRegexPageChars: 500_000,
  defaultPhoneRegion: "US",
  includeUnnamedContacts: false,
};

export function extractionOptionsFromSettings(settings: ExtensionSettings): ExtractionOptions {
  return {
    enableRegexFallback: settings.enableRegexFallback,
    enabledPlatforms: { ...DEFAULT_PLATFORM_TOGGLES, ...settings.enabledPlatforms },
    maxRegexPageChars: DEFAULT_EXTRACTION_OPTIONS.maxRegexPageChars,
    defaultPhoneRegion: settings.defaultPhoneRegion,
    includeUnnamedContacts: settings.includeUnnamedContacts,
  };
}

export function isPlatformEnabled(options: ExtractionOptions, adapterId: string): boolean {
  return options.enabledPlatforms[adapterId] !== false;
}

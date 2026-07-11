import type { CountryCode, PhoneNumber } from "libphonenumber-js";
import { getCountries, isSupportedCountry, parsePhoneNumberFromString } from "libphonenumber-js";
import type { ContactPhone } from "./types";

export interface PhoneParseOptions {
  defaultCountry?: CountryCode;
}

const FALLBACK_PHONE_REGION: CountryCode = "US";

export function detectBrowserPhoneRegion(): CountryCode {
  if (typeof navigator === "undefined") {
    return FALLBACK_PHONE_REGION;
  }

  const locales = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const locale of locales) {
    const region = locale.split(/[-_]/).pop()?.toUpperCase();
    if (region && isSupportedCountry(region)) {
      return region;
    }
  }

  return FALLBACK_PHONE_REGION;
}

export function resolvePhoneRegion(value: unknown): CountryCode {
  if (typeof value === "string" && isSupportedCountry(value.toUpperCase())) {
    return value.toUpperCase() as CountryCode;
  }

  return detectBrowserPhoneRegion();
}

export function listPhoneRegions(): CountryCode[] {
  return getCountries().sort((left, right) =>
    phoneRegionLabel(left).localeCompare(phoneRegionLabel(right)),
  );
}

export function phoneRegionLabel(region: CountryCode, locale = "en"): string {
  try {
    const displayNames = new Intl.DisplayNames([locale], { type: "region" });
    const label = displayNames.of(region);
    return label ? `${region} — ${label}` : region;
  } catch {
    return region;
  }
}

export function parseRegionAwarePhone(
  value: string,
  options: PhoneParseOptions = {},
): PhoneNumber | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const candidates = buildParseCandidates(trimmed, options.defaultCountry);
  for (const candidate of candidates) {
    const parsed = parsePhoneNumberFromString(candidate.value, candidate.defaultCountry);
    if (!parsed?.isValid()) {
      continue;
    }

    if (candidate.defaultCountry && parsed.country !== candidate.defaultCountry) {
      continue;
    }

    return parsed;
  }

  return undefined;
}

export function contactPhoneFromParsed(parsed: PhoneNumber): ContactPhone {
  return {
    value: parsed.formatInternational(),
    e164: parsed.number,
    type: parsed.getType() ?? undefined,
    region: parsed.country,
  };
}

export function isValidContactPhone(value: string, defaultCountry?: CountryCode): boolean {
  return parseRegionAwarePhone(value, { defaultCountry }) !== undefined;
}

function buildParseCandidates(
  value: string,
  defaultCountry?: CountryCode,
): Array<{ value: string; defaultCountry?: CountryCode }> {
  const candidates: Array<{ value: string; defaultCountry?: CountryCode }> = [];

  if (value.startsWith("+")) {
    candidates.push({ value });
    return candidates;
  }

  const digitsOnly = value.replace(/\D/g, "");
  const bareInternational = looksLikeBareInternational(value);

  if (bareInternational) {
    candidates.push({ value: `+${digitsOnly}` });
  }

  if (defaultCountry && looksLikeNationalFormat(value, defaultCountry)) {
    candidates.push({ value, defaultCountry });
  }

  return candidates;
}

const TRUNK_PREFIX_COUNTRIES = new Set<CountryCode>([
  "IE",
  "GB",
  "AU",
  "NZ",
  "ZA",
  "FR",
  "DE",
  "IT",
  "ES",
  "NL",
  "BE",
  "AT",
  "CH",
  "PL",
  "PT",
  "SE",
  "NO",
  "DK",
  "FI",
  "IN",
  "JP",
  "MY",
  "SG",
  "TH",
  "PH",
]);

function looksLikeNationalFormat(value: string, defaultCountry: CountryCode): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) {
    return false;
  }

  if (TRUNK_PREFIX_COUNTRIES.has(defaultCountry)) {
    return trimmed.startsWith("0");
  }

  if (defaultCountry === "US" || defaultCountry === "CA") {
    return /^(\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}$/.test(trimmed);
  }

  return !looksLikeBareInternational(value);
}

function looksLikeBareInternational(value: string): boolean {
  const digitsOnly = value.replace(/\D/g, "");
  return digitsOnly.length >= 8 && digitsOnly.length <= 15 && /^[\d+\s().-]+$/.test(value);
}

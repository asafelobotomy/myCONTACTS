export const MIN_PHONE_DIGITS = 7;
export const MAX_PHONE_DIGITS = 15;

const BLOCKED_DISPLAY_NAMES = new Set(
  [
    "Unread",
    "Groups",
    "Favorites",
    "Messages",
    "Chats",
    "Archived",
    "Status",
    "Calls",
    "Communities",
    "Channels",
    "Locked chats",
    "Starred messages",
    "Request account info",
    "WhatsApp",
    "You",
    "Me",
  ].map(normalizeLabel),
);

export function isBlockedDisplayName(value: string | undefined): boolean {
  if (!value?.trim()) {
    return false;
  }

  return BLOCKED_DISPLAY_NAMES.has(normalizeLabel(value));
}

export function looksLikePhone(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\+?\d[\d\s().-]*$/.test(trimmed)) {
    return false;
  }

  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= MIN_PHONE_DIGITS;
}

export function humanDisplayName(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const trimmed = value.trim();
  if (looksLikePhone(trimmed) || isBlockedDisplayName(trimmed)) {
    return undefined;
  }

  return trimmed;
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

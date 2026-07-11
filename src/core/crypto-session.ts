const SESSION_PASSPHRASE_KEY = "libraryPassphrase";

let inMemoryPassphrase: string | null = null;

export function getSessionPassphrase(): string | null {
  return inMemoryPassphrase;
}

export async function setSessionPassphrase(passphrase: string | null): Promise<void> {
  inMemoryPassphrase = passphrase;
  await wipeLegacySessionPassphrase();
}

export async function restoreSessionPassphrase(): Promise<string | null> {
  await wipeLegacySessionPassphrase();
  return inMemoryPassphrase;
}

export function clearSessionPassphrase(): void {
  inMemoryPassphrase = null;
}

async function wipeLegacySessionPassphrase(): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.session) {
    return;
  }

  await chrome.storage.session.remove(SESSION_PASSPHRASE_KEY);
}

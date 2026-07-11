import type { Contact } from "./types";

export interface EncryptedLibraryPayload {
  iv: string;
  ciphertext: string;
}

const PBKDF2_ITERATIONS = 310_000;

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const saltBytes = new Uint8Array(salt);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptLibrary(
  contacts: Contact[],
  passphrase: string,
  salt: Uint8Array,
): Promise<EncryptedLibraryPayload> {
  const key = await deriveKey(passphrase, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(contacts));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  return {
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptLibrary(
  payload: EncryptedLibraryPayload,
  passphrase: string,
  salt: Uint8Array,
): Promise<Contact[]> {
  const key = await deriveKey(passphrase, salt);
  const iv = new Uint8Array(decodeBase64(payload.iv));
  const ciphertext = new Uint8Array(decodeBase64(payload.ciphertext));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("Decrypted library payload is invalid.");
  }

  return parsed as Contact[];
}

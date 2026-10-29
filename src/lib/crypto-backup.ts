/**
 * Password-based encryption for backup ZIPs. Key material never leaves the browser.
 * Format: magic | salt(16) | iv(12) | ciphertext+tag
 */

const MAGIC = new TextEncoder().encode("PTENC1");
const ITERATIONS = 210_000;

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBlob(blob: Blob, password: string): Promise<Blob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plain = new Uint8Array(await blob.arrayBuffer());
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain),
  );
  const out = new Uint8Array(MAGIC.length + salt.length + iv.length + cipher.length);
  out.set(MAGIC, 0);
  out.set(salt, MAGIC.length);
  out.set(iv, MAGIC.length + salt.length);
  out.set(cipher, MAGIC.length + salt.length + iv.length);
  return new Blob([out], { type: "application/octet-stream" });
}

export function looksEncrypted(blob: Blob): Promise<boolean> {
  return blob.slice(0, MAGIC.length).arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    if (bytes.length < MAGIC.length) return false;
    return MAGIC.every((b, i) => bytes[i] === b);
  });
}

export async function decryptBlob(blob: Blob, password: string): Promise<Blob> {
  const data = new Uint8Array(await blob.arrayBuffer());
  if (data.length < MAGIC.length + 16 + 12 + 16) throw new Error("This file is not a Privytrail encrypted backup.");
  if (!MAGIC.every((b, i) => data[i] === b)) throw new Error("This file is not a Privytrail encrypted backup.");
  const salt = data.slice(MAGIC.length, MAGIC.length + 16);
  const iv = data.slice(MAGIC.length + 16, MAGIC.length + 28);
  const cipher = data.slice(MAGIC.length + 28);
  const key = await deriveKey(password, salt);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    return new Blob([plain], { type: "application/zip" });
  } catch {
    throw new Error("Wrong password, or the file is damaged.");
  }
}

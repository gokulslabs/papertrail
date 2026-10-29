/** SHA-256 hex digest of a Blob (original file bytes). */
export async function sha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function truncateHash(hash: string, keep = 12): string {
  if (hash.length <= keep * 2 + 1) return hash;
  return `${hash.slice(0, keep)}…${hash.slice(-keep)}`;
}

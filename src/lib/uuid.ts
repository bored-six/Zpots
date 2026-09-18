/**
 * Shared id generator for spot ids (spots-repo.ts) and the browser-local
 * confirmer id (local-identity.ts) -- see spec section 5.6 / edge cases.
 *
 * `crypto.randomUUID()` is undefined on insecure origins (e.g. testing over
 * plain HTTP from a phone on the LAN), so this falls back to building a
 * version-4-shaped UUID from `crypto.getRandomValues`, which is available
 * wherever the Web Crypto API exists at all.
 */
export function generateUuid(): string {
  const cryptoObj = globalThis.crypto;

  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }

  const bytes = new Uint8Array(16);
  cryptoObj.getRandomValues(bytes);

  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

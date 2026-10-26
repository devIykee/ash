import { gcm } from "@noble/ciphers/aes.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { AshError } from "@/domain/errors";

export const PACK_CHUNK = 16 * 1024;
export const MAX_PLAINTEXT = 256 * 1024;

export type AshPack = {
  v: 1;
  chunkSize: number;
  plaintextSha256: string;
  chunks: { iv: string; ciphertext: string }[];
};

export function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

function aad(index: number, plaintextHash: string): Uint8Array {
  return utf8ToBytes(`ash-pack-v1|${index}|${plaintextHash}`);
}

export function encryptPack(plaintext: Uint8Array, key: Uint8Array = randomBytes(32)): { pack: AshPack; key: Uint8Array } {
  if (key.length !== 32) throw new AshError("invalid_key", "Pack key must be 32 bytes.");
  if (plaintext.length === 0) throw new AshError("invalid_payload", "The file is empty.");
  if (plaintext.length > MAX_PLAINTEXT) {
    throw new AshError("invalid_payload", "Files are limited to 256 KiB in this build.");
  }
  const plaintextSha256 = sha256Hex(plaintext);
  const chunks: AshPack["chunks"] = [];
  for (let offset = 0, index = 0; offset < plaintext.length; offset += PACK_CHUNK, index += 1) {
    const slice = plaintext.slice(offset, offset + PACK_CHUNK);
    const iv = randomBytes(12);
    const ciphertext = gcm(key, iv, aad(index, plaintextSha256)).encrypt(slice);
    chunks.push({ iv: bytesToHex(iv), ciphertext: bytesToHex(ciphertext) });
  }
  return { pack: { v: 1, chunkSize: PACK_CHUNK, plaintextSha256, chunks }, key };
}

export function decryptPack(pack: AshPack, key: Uint8Array): Uint8Array {
  assertPack(pack);
  if (key.length !== 32) throw new AshError("invalid_key", "Pack key must be 32 bytes.");
  const parts: Uint8Array[] = [];
  let total = 0;
  pack.chunks.forEach((chunk, index) => {
    try {
      const plain = gcm(key, hexToBytes(chunk.iv), aad(index, pack.plaintextSha256)).decrypt(hexToBytes(chunk.ciphertext));
      parts.push(plain);
      total += plain.length;
    } catch {
      throw new AshError("invalid_payload", "Ciphertext authentication failed. The key is wrong or the package was modified.");
    }
  });
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  if (sha256Hex(out) !== pack.plaintextSha256) {
    throw new AshError("invalid_payload", "Decrypted bytes do not match the committed plaintext hash.");
  }
  return out;
}

export function assertPack(pack: AshPack): void {
  if (!pack || pack.v !== 1 || !Array.isArray(pack.chunks) || pack.chunks.length === 0) {
    throw new AshError("invalid_payload", "Encrypted package is malformed.");
  }
  if (!/^[0-9a-f]{64}$/.test(pack.plaintextSha256)) {
    throw new AshError("invalid_payload", "Plaintext hash is malformed.");
  }
  let bytes = 0;
  for (const chunk of pack.chunks) {
    if (!/^[0-9a-f]{24}$/.test(chunk.iv) || !/^[0-9a-f]+$/.test(chunk.ciphertext)) {
      throw new AshError("invalid_payload", "Encrypted chunk is malformed.");
    }
    bytes += chunk.ciphertext.length / 2;
  }
  if (bytes > MAX_PLAINTEXT + pack.chunks.length * 32) {
    throw new AshError("invalid_payload", "Encrypted package is too large.");
  }
}

export function ciphertextSha256(pack: AshPack): string {
  assertPack(pack);
  const joined = pack.chunks.map((chunk) => chunk.iv + chunk.ciphertext).join("");
  return sha256Hex(utf8ToBytes(joined));
}

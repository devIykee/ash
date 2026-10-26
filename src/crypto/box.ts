import { gcm } from "@noble/ciphers/aes.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { AshError } from "@/domain/errors";

export type SealedBox = {
  v: 1;
  ephPublic: string;
  iv: string;
  ciphertext: string;
};

function sealKey(shared: Uint8Array): Uint8Array {
  return hkdf(sha256, shared, utf8ToBytes("ash-wrap-v1"), utf8ToBytes("x25519-aes-256-gcm"), 32);
}

export function generateX25519(): { privateKey: string; publicKey: string } {
  const privateKey = x25519.utils.randomSecretKey();
  return { privateKey: bytesToHex(privateKey), publicKey: bytesToHex(x25519.getPublicKey(privateKey)) };
}

export function publicFromPrivate(privateKeyHex: string): string {
  return bytesToHex(x25519.getPublicKey(hexToBytes(privateKeyHex)));
}

export function sealTo(publicKeyHex: string, plaintext: Uint8Array): SealedBox {
  const recipient = hexToBytes(publicKeyHex);
  if (recipient.length !== 32) throw new AshError("invalid_key", "Recipient key must be 32 bytes.");
  const ephemeral = x25519.utils.randomSecretKey();
  const shared = x25519.getSharedSecret(ephemeral, recipient);
  const key = sealKey(shared);
  const iv = randomBytes(12);
  const ciphertext = gcm(key, iv).encrypt(plaintext);
  return { v: 1, ephPublic: bytesToHex(x25519.getPublicKey(ephemeral)), iv: bytesToHex(iv), ciphertext: bytesToHex(ciphertext) };
}

export function openBox(privateKeyHex: string, box: SealedBox): Uint8Array {
  if (box.v !== 1) throw new AshError("invalid_key", "Unknown sealed box version.");
  const shared = x25519.getSharedSecret(hexToBytes(privateKeyHex), hexToBytes(box.ephPublic));
  const key = sealKey(shared);
  try {
    return gcm(key, hexToBytes(box.iv)).decrypt(hexToBytes(box.ciphertext));
  } catch {
    throw new AshError("invalid_key", "Sealed box authentication failed.");
  }
}

export function assertSealedBox(value: unknown): SealedBox {
  if (!value || typeof value !== "object") throw new AshError("invalid_key", "Sealed box is missing.");
  const box = value as SealedBox;
  if (box.v !== 1 || !/^[0-9a-f]{64}$/.test(box.ephPublic) || !/^[0-9a-f]{24}$/.test(box.iv)) {
    throw new AshError("invalid_key", "Sealed box is malformed.");
  }
  if (!/^[0-9a-f]+$/.test(box.ciphertext) || box.ciphertext.length < 32) {
    throw new AshError("invalid_key", "Sealed box ciphertext is malformed.");
  }
  return box;
}

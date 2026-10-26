import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { canonicalJson } from "@/domain/canonical";

export function signingSeed(material: string): Uint8Array {
  return sha256(utf8ToBytes(material));
}

export function signingPublicKey(material: string): string {
  return bytesToHex(ed25519.getPublicKey(signingSeed(material)));
}

export function signDocument(material: string, document: unknown): { publicKey: string; signature: string } {
  const message = utf8ToBytes(canonicalJson(document));
  const seed = signingSeed(material);
  return {
    publicKey: bytesToHex(ed25519.getPublicKey(seed)),
    signature: bytesToHex(ed25519.sign(message, seed)),
  };
}

export function verifyDocument(publicKey: string, signature: string, document: unknown): boolean {
  try {
    return ed25519.verify(hexToBytes(signature), utf8ToBytes(canonicalJson(document)), hexToBytes(publicKey));
  } catch {
    return false;
  }
}

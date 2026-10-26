import { bytesToHex, randomBytes } from "@noble/hashes/utils.js";

export function newId(prefix: string): string {
  return `${prefix}_${bytesToHex(randomBytes(16))}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

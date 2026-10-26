import { randomBytes } from "@noble/hashes/utils.js";
import { AshError } from "@/domain/errors";
import { base64UrlToBytes, bytesToBase64Url } from "./encoding";

const POLY = 0x11b;

function mul(a: number, b: number): number {
  let left = a;
  let right = b;
  let product = 0;
  for (let bit = 0; bit < 8; bit += 1) {
    if (right & 1) product ^= left;
    left <<= 1;
    if (left & 0x100) left ^= POLY;
    right >>= 1;
  }
  return product & 0xff;
}

function inv(value: number): number {
  if (value === 0) throw new Error("division by zero");
  let result = 1;
  let base = value;
  let exp = 254;
  while (exp > 0) {
    if (exp & 1) result = mul(result, base);
    base = mul(base, base);
    exp >>= 1;
  }
  return result;
}

function div(a: number, b: number): number {
  return mul(a, inv(b));
}

export type ShamirShare = {
  index: number;
  bytes: Uint8Array;
};

function splitByte(secret: number, indexes: number[]): Map<number, number> {
  let coefficient = 0;
  while (coefficient === 0) coefficient = randomBytes(1)[0];
  const out = new Map<number, number>();
  for (const index of indexes) out.set(index, secret ^ mul(coefficient, index));
  return out;
}

export function splitSecret(secret: Uint8Array, indexes: number[] = [1, 2, 3]): ShamirShare[] {
  if (secret.length !== 32) throw new AshError("invalid_key", "Content keys are 32 bytes.");
  if (new Set(indexes).size !== indexes.length || indexes.some((index) => index < 1 || index > 255)) {
    throw new AshError("invalid_key", "Shamir share indexes must be unique and non-zero.");
  }
  const columns = indexes.map((index) => ({ index, bytes: new Uint8Array(secret.length) }));
  for (let position = 0; position < secret.length; position += 1) {
    const parts = splitByte(secret[position], indexes);
    for (const column of columns) column.bytes[position] = parts.get(column.index) ?? 0;
  }
  return columns;
}

export function combineShares(shares: ShamirShare[]): Uint8Array {
  if (shares.length < 2) throw new AshError("invalid_key", "Two shares are required.");
  const length = shares[0]?.bytes.length;
  if (!length || shares.some((share) => share.bytes.length !== length)) {
    throw new AshError("invalid_key", "Share lengths do not match.");
  }
  if (new Set(shares.map((share) => share.index)).size !== shares.length) {
    throw new AshError("invalid_key", "Share indexes must be unique.");
  }
  const secret = new Uint8Array(length);
  for (let position = 0; position < length; position += 1) {
    let value = 0;
    for (let i = 0; i < shares.length; i += 1) {
      let numerator = 1;
      let denominator = 1;
      for (let j = 0; j < shares.length; j += 1) {
        if (i === j) continue;
        numerator = mul(numerator, shares[j].index);
        denominator = mul(denominator, shares[i].index ^ shares[j].index);
      }
      value ^= mul(shares[i].bytes[position], div(numerator, denominator));
    }
    secret[position] = value;
  }
  return secret;
}

export function shareToJson(share: ShamirShare): { index: number; bytes: string } {
  return { index: share.index, bytes: bytesToBase64Url(share.bytes) };
}

export function shareFromJson(value: { index: number; bytes: string }): ShamirShare {
  if (!Number.isInteger(value.index) || value.index < 1 || value.index > 255) {
    throw new AshError("invalid_key", "Share index is invalid.");
  }
  const bytes = base64UrlToBytes(value.bytes);
  if (bytes.length !== 32) throw new AshError("invalid_key", "Share must be 32 bytes.");
  return { index: value.index, bytes };
}

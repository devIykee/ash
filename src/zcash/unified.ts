// ZIP 316 unified addresses and viewing keys, plus ZIP 32 Sapling extended full viewing keys.
// Checked against zcash-test-vectors in tests/unified.test.ts.
import { bech32, bech32m } from "bech32";
import { blake2b } from "@noble/hashes/blake2.js";
import { bytesToHex, concatBytes } from "@noble/hashes/utils.js";
import type { Network } from "@/domain/types";
import { ivkFrom, leToBigint, splitRawAddress, type SaplingAddress } from "./sapling";

const LIMIT = 4096;

function personal(prefix: string, a: number, b: number, c: number): Uint8Array {
  const out = new Uint8Array(16);
  out.set(new TextEncoder().encode(prefix));
  out[13] = a;
  out[14] = b;
  out[15] = c;
  return out;
}

function H(i: number, u: Uint8Array, length: number): Uint8Array {
  return blake2b(u, { dkLen: length, personalization: personal("UA_F4Jumble_H", i, 0, 0) });
}

function G(i: number, u: Uint8Array, length: number): Uint8Array {
  const parts: Uint8Array[] = [];
  for (let j = 0; j * 64 < length; j += 1) {
    parts.push(blake2b(u, { dkLen: 64, personalization: personal("UA_F4Jumble_G", i, j & 0xff, j >> 8) }));
  }
  return concatBytes(...parts).slice(0, length);
}

function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  return Uint8Array.from(a, (value, index) => value ^ b[index]);
}

export function f4jumble(message: Uint8Array): Uint8Array {
  const lL = Math.min(64, Math.floor(message.length / 2));
  const lR = message.length - lL;
  let x: Uint8Array = message.slice(0, lL);
  let y: Uint8Array = message.slice(lL);
  y = xor(y, G(0, x, lR));
  x = xor(x, H(0, y, lL));
  y = xor(y, G(1, x, lR));
  x = xor(x, H(1, y, lL));
  return concatBytes(x, y);
}

export function f4jumbleInverse(message: Uint8Array): Uint8Array {
  const lL = Math.min(64, Math.floor(message.length / 2));
  const lR = message.length - lL;
  let x: Uint8Array = message.slice(0, lL);
  let y: Uint8Array = message.slice(lL);
  x = xor(x, H(1, y, lL));
  y = xor(y, G(1, x, lR));
  x = xor(x, H(0, y, lL));
  y = xor(y, G(0, x, lR));
  return concatBytes(x, y);
}

function readCompactSize(bytes: Uint8Array, offset: number): [number, number] {
  const first = bytes[offset];
  if (first === undefined) throw new Error("Truncated encoding.");
  if (first < 0xfd) return [first, offset + 1];
  if (first === 0xfd) return [bytes[offset + 1] | (bytes[offset + 2] << 8), offset + 3];
  if (first === 0xfe) return [(bytes[offset + 1] | (bytes[offset + 2] << 8) | (bytes[offset + 3] << 16)) + bytes[offset + 4] * 2 ** 24, offset + 5];
  throw new Error("Size too large.");
}

const UNIFIED_HRP: Record<string, { kind: "address" | "fvk" | "ivk"; network: Network }> = {
  u: { kind: "address", network: "mainnet" },
  utest: { kind: "address", network: "testnet" },
  uview: { kind: "fvk", network: "mainnet" },
  uviewtest: { kind: "fvk", network: "testnet" },
  uivk: { kind: "ivk", network: "mainnet" },
  uivktest: { kind: "ivk", network: "testnet" },
};

export type UnifiedItems = { kind: "address" | "fvk" | "ivk"; network: Network; items: Map<number, Uint8Array> };

/** Decodes any ZIP 316 unified encoding into its typecode items. */
export function decodeUnified(encoded: string): UnifiedItems {
  const value = encoded.trim();
  let decoded: { prefix: string; words: number[] };
  try {
    decoded = bech32m.decode(value, LIMIT);
  } catch {
    throw new Error("The unified encoding checksum is invalid.");
  }
  const meta = UNIFIED_HRP[decoded.prefix];
  if (!meta) throw new Error(`Unknown unified prefix ${decoded.prefix}.`);
  const raw = f4jumbleInverse(Uint8Array.from(bech32m.fromWords(decoded.words)));
  const padding = new Uint8Array(16);
  padding.set(new TextEncoder().encode(decoded.prefix));
  if (bytesToHex(raw.slice(-16)) !== bytesToHex(padding)) throw new Error("The unified encoding padding is invalid.");
  const body = raw.slice(0, -16);
  const items = new Map<number, Uint8Array>();
  let offset = 0;
  let last = -1;
  while (offset < body.length) {
    const [typecode, afterType] = readCompactSize(body, offset);
    const [length, afterLength] = readCompactSize(body, afterType);
    if (afterLength + length > body.length) throw new Error("A unified item is truncated.");
    if (typecode <= last) throw new Error("Unified items are out of order.");
    last = typecode;
    items.set(typecode, body.slice(afterLength, afterLength + length));
    offset = afterLength + length;
  }
  return { ...meta, items };
}

const SAPLING = 0x02;
const ORCHARD = 0x03;

export type ReceiverReport = {
  network: Network;
  sapling: SaplingAddress | null;
  hasOrchard: boolean;
  /** The Sapling receiver as a plain zs1/ztestsapling1 address, when present. */
  saplingEncoded: string | null;
};

export function encodeSaplingAddress(address: SaplingAddress, network: Network): string {
  const words = bech32.toWords(concatBytes(address.d, address.pkd));
  return bech32.encode(network === "mainnet" ? "zs" : "ztestsapling", words, 512);
}

/** Finds the Sapling receiver in a Sapling or unified address. */
export function saplingReceiver(address: string): ReceiverReport {
  const value = address.trim();
  if (value.startsWith("zs1") || value.startsWith("ztestsapling1")) {
    const decoded = bech32.decode(value, 512);
    const network: Network = decoded.prefix === "zs" ? "mainnet" : "testnet";
    const sapling = splitRawAddress(Uint8Array.from(bech32.fromWords(decoded.words)));
    return { network, sapling, hasOrchard: false, saplingEncoded: value };
  }
  const unified = decodeUnified(value);
  if (unified.kind !== "address") throw new Error("That is a viewing key, not an address.");
  const raw = unified.items.get(SAPLING);
  const sapling = raw ? splitRawAddress(raw) : null;
  return {
    network: unified.network,
    sapling,
    hasOrchard: unified.items.has(ORCHARD),
    saplingEncoded: sapling ? encodeSaplingAddress(sapling, unified.network) : null,
  };
}

export type SaplingViewingKey = {
  network: Network;
  /** Where the key came from, for display. */
  source: "unified_full" | "unified_incoming" | "sapling_extended_full";
  ivk: bigint;
  /** Outgoing viewing key, present only for full viewing keys. Lets ASH confirm payments this wallet sent. */
  ovk: Uint8Array | null;
  dk: Uint8Array;
};

/** Parses a viewing key and returns its Sapling part. Rejects spending keys outright. */
export function parseViewingKey(input: string): SaplingViewingKey {
  const value = input.trim();
  if (/^(secret-extended-key|uskm?|zxsk|secret)/i.test(value)) {
    throw new Error("That looks like a spending key. Never paste a spending key or seed phrase. Use a viewing key.");
  }
  if (value.startsWith("zxviews1") || value.startsWith("zxviewtestsapling1")) {
    let decoded: { prefix: string; words: number[] };
    try {
      decoded = bech32.decode(value, LIMIT);
    } catch {
      throw new Error("The Sapling viewing key checksum is invalid.");
    }
    const bytes = Uint8Array.from(bech32.fromWords(decoded.words));
    if (bytes.length !== 169) throw new Error("The Sapling viewing key has the wrong length.");
    const fvk = bytes.slice(41);
    const ak = fvk.slice(0, 32);
    const nk = fvk.slice(32, 64);
    return {
      network: decoded.prefix === "zxviews" ? "mainnet" : "testnet",
      source: "sapling_extended_full",
      ivk: ivkFrom(ak, nk),
      ovk: fvk.slice(64, 96),
      dk: fvk.slice(96, 128),
    };
  }
  const unified = decodeUnified(value);
  const item = unified.items.get(SAPLING);
  if (unified.kind === "address") throw new Error("That is an address. Paste the viewing key for it.");
  if (!item) throw new Error("This viewing key has no Sapling part. ASH verifies Sapling payments, so export a key that includes Sapling.");
  if (unified.kind === "fvk") {
    if (item.length !== 128) throw new Error("The Sapling full viewing key has the wrong length.");
    return {
      network: unified.network,
      source: "unified_full",
      ivk: ivkFrom(item.slice(0, 32), item.slice(32, 64)),
      ovk: item.slice(64, 96),
      dk: item.slice(96, 128),
    };
  }
  if (item.length !== 64) throw new Error("The Sapling incoming viewing key has the wrong length.");
  const ivk = leToBigint(item.slice(32, 64));
  if (ivk >= 1n << 251n) throw new Error("The Sapling incoming viewing key is not valid.");
  return { network: unified.network, source: "unified_incoming", ivk, ovk: null, dk: item.slice(0, 32) };
}

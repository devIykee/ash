// ZIP 32 Sapling key derivation (hardened paths only) and FF1-AES256 diversifiers.
// Wallets derive a Sapling account at m/32'/coin_type'/account', with coin_type 133 on mainnet
// and 1 on testnet, so a phrase created here restores in Zashi, YWallet, or zcash-cli.
// Checked against zcash-test-vectors in tests/zip32.test.ts.
import { ecb } from "@noble/ciphers/aes.js";
import { bech32 } from "bech32";
import { blake2b } from "@noble/hashes/blake2.js";
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import type { Network } from "@/domain/types";
import { bigintToLe, diversifyHash, ivkFrom, prfExpand, R_J, saplingGenerators, toScalar, type SaplingAddress } from "./sapling";

export type ExtendedSpendingKey = {
  depth: number;
  parentFvkTag: Uint8Array;
  childIndex: number;
  chainCode: Uint8Array;
  ask: bigint;
  nsk: bigint;
  ovk: Uint8Array;
  dk: Uint8Array;
};

const HARDENED = 0x80000000;

export function master(seed: Uint8Array): ExtendedSpendingKey {
  const I = blake2b(seed, { dkLen: 64, personalization: utf8ToBytes("ZcashIP32Sapling") });
  const sk = I.slice(0, 32);
  return {
    depth: 0,
    parentFvkTag: new Uint8Array(4),
    childIndex: 0,
    chainCode: I.slice(32),
    ask: toScalar(prfExpand(sk, new Uint8Array([0]))),
    nsk: toScalar(prfExpand(sk, new Uint8Array([1]))),
    ovk: prfExpand(sk, new Uint8Array([2])).slice(0, 32),
    dk: prfExpand(sk, new Uint8Array([0x10])).slice(0, 32),
  };
}

export function fullViewingParts(key: ExtendedSpendingKey) {
  const g = saplingGenerators();
  const ak = g.spendAuth.multiply(key.ask).toBytes();
  const nk = g.proofGen.multiply(key.nsk).toBytes();
  return { ak, nk, ovk: key.ovk, dk: key.dk, ivk: ivkFrom(ak, nk) };
}

/** First four bytes of the full viewing key fingerprint. */
export function fvkTag(key: ExtendedSpendingKey): Uint8Array {
  const { ak, nk, ovk } = fullViewingParts(key);
  return blake2b(concatBytes(ak, nk, ovk), { dkLen: 32, personalization: utf8ToBytes("ZcashSaplingFVFP") }).slice(0, 4);
}

function le32(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

/** CKDsk for a hardened index (ZIP 32, Sapling child key derivation). */
export function deriveHardened(parent: ExtendedSpendingKey, index: number): ExtendedSpendingKey {
  const i = (index | HARDENED) >>> 0;
  const parts = concatBytes(bigintToLe(parent.ask, 32), bigintToLe(parent.nsk, 32), parent.ovk, parent.dk);
  const I = prfExpand(parent.chainCode, concatBytes(new Uint8Array([0x11]), parts, le32(i)));
  const IL = I.slice(0, 32);
  return {
    depth: parent.depth + 1,
    parentFvkTag: fvkTag(parent),
    childIndex: i,
    chainCode: I.slice(32),
    ask: (toScalar(prfExpand(IL, new Uint8Array([0x13]))) + parent.ask) % R_J,
    nsk: (toScalar(prfExpand(IL, new Uint8Array([0x14]))) + parent.nsk) % R_J,
    ovk: prfExpand(IL, concatBytes(new Uint8Array([0x15]), parent.ovk)).slice(0, 32),
    dk: prfExpand(IL, concatBytes(new Uint8Array([0x16]), parent.dk)).slice(0, 32),
  };
}

/** The account key wallets use: m/32'/coin_type'/account'. */
export function saplingAccount(seed: Uint8Array, network: Network, account = 0): ExtendedSpendingKey {
  const coin = network === "mainnet" ? 133 : 1;
  return deriveHardened(deriveHardened(deriveHardened(master(seed), 32), coin), account);
}

// FF1-AES256 (NIST SP 800-38G) over binary numeral strings of 88 bits, as ZIP 32 uses for
// diversifiers. Bits are read from little-endian bytes, least significant bit first.
function bitsFromBytesLE(bytes: Uint8Array): number[] {
  const bits: number[] = [];
  for (const byte of bytes) for (let i = 0; i < 8; i += 1) bits.push((byte >> i) & 1);
  return bits;
}

function bytesFromBitsLE(bits: number[]): Uint8Array {
  const out = new Uint8Array(bits.length / 8);
  bits.forEach((bit, index) => {
    out[index >> 3] |= bit << (index & 7);
  });
  return out;
}

function num(bits: number[]): bigint {
  let value = 0n;
  for (const bit of bits) value = (value << 1n) | BigInt(bit);
  return value;
}

function str(value: bigint, length: number): number[] {
  const bits = new Array<number>(length).fill(0);
  let v = value;
  for (let i = length - 1; i >= 0; i -= 1) {
    bits[i] = Number(v & 1n);
    v >>= 1n;
  }
  return bits;
}

function beBytes(value: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i >= 0; i -= 1) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

export function ff1Aes256Encrypt(key: Uint8Array, input: Uint8Array): Uint8Array {
  const X = bitsFromBytesLE(input);
  const n = X.length;
  const u = Math.floor(n / 2);
  const v = n - u;
  let A = X.slice(0, u);
  let B = X.slice(u);
  const b = Math.ceil(Math.ceil(v) / 8);
  const d = 4 * Math.ceil(b / 4) + 4;
  const P = new Uint8Array([1, 2, 1, 0, 0, 2, 10, u & 0xff, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff, 0, 0, 0, 0]);
  // One AES block per call. The library refuses to reuse an instance, which is fine here.
  const block = (data: Uint8Array) => ecb(key, { disablePadding: true }).encrypt(data);
  const prfP = block(P);
  for (let i = 0; i < 10; i += 1) {
    const Q = new Uint8Array(16);
    Q[16 - b - 1] = i;
    Q.set(beBytes(num(B), b), 16 - b);
    const R = block(prfP.map((byte, index) => byte ^ Q[index]));
    const y = num(bitsFromBytesBE(R.slice(0, d)));
    const m = i % 2 === 0 ? u : v;
    const c = (num(A) + y) % (1n << BigInt(m));
    A = B;
    B = str(c, m);
  }
  return bytesFromBitsLE([...A, ...B]);
}

function bitsFromBytesBE(bytes: Uint8Array): number[] {
  const bits: number[] = [];
  for (const byte of bytes) for (let i = 7; i >= 0; i -= 1) bits.push((byte >> i) & 1);
  return bits;
}

/** Diversifier for index j, or null when it does not give a valid address. */
export function diversifier(dk: Uint8Array, index: bigint): Uint8Array | null {
  const d = ff1Aes256Encrypt(dk, bigintToLe(index, 11));
  return diversifyHash(d) ? d : null;
}

/** The default address: the first valid diversifier index, as wallets choose it. */
export function defaultAddress(key: ExtendedSpendingKey): { index: bigint; address: SaplingAddress } {
  const { dk, ivk } = fullViewingParts(key);
  for (let j = 0n; j < 1n << 20n; j += 1n) {
    const d = diversifier(dk, j);
    if (!d) continue;
    const gd = diversifyHash(d)!;
    return { index: j, address: { d, pkd: gd.multiply(ivk).toBytes() } };
  }
  throw new Error("No valid diversifier found.");
}

/** ZIP 32 extended full viewing key bytes: depth, parent tag, child index, chain code, ak, nk, ovk, dk. */
export function extendedFvkBytes(key: ExtendedSpendingKey): Uint8Array {
  const { ak, nk, ovk, dk } = fullViewingParts(key);
  return concatBytes(new Uint8Array([key.depth]), key.parentFvkTag, le32(key.childIndex), key.chainCode, ak, nk, ovk, dk);
}

export function encodeExtendedFvk(key: ExtendedSpendingKey, network: Network): string {
  return bech32.encode(network === "mainnet" ? "zxviews" : "zxviewtestsapling", bech32.toWords(extendedFvkBytes(key)), 4096);
}

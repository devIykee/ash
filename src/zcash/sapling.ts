// Sapling key, address, and note primitives, following the Zcash protocol specification
// (sections 4.2.2, 5.4.1.7, 5.4.8.2, 4.19, 4.20 and ZIP 212). Checked against the official
// zcash-test-vectors in tests/sapling.test.ts.
import { chacha20, chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { jubjub, jubjub_groupHash } from "@noble/curves/misc.js";
import { blake2b, blake2s } from "@noble/hashes/blake2.js";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";

type Point = ReturnType<typeof jubjub.Point.fromHex>;

/** Order of the prime-order Jubjub subgroup. */
export const R_J = jubjub.CURVE.n;
const ZERO_POINT = jubjub.Point.ZERO;

const enc = (text: string) => utf8ToBytes(text);

export function leToBigint(bytes: Uint8Array): bigint {
  let out = 0n;
  for (let i = bytes.length - 1; i >= 0; i -= 1) out = (out << 8n) | BigInt(bytes[i]);
  return out;
}

export function bigintToLe(value: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let v = value;
  for (let i = 0; i < length; i += 1) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

const mod = (a: bigint, m: bigint) => ((a % m) + m) % m;

/** PRF^expand(sk, t) = BLAKE2b-512("Zcash_ExpandSeed", sk || t). */
export function prfExpand(sk: Uint8Array, t: Uint8Array): Uint8Array {
  return blake2b(concatBytes(sk, t), { dkLen: 64, personalization: enc("Zcash_ExpandSeed") });
}

/** ToScalar: interpret 64 bytes little-endian, reduce mod r_J. */
export function toScalar(bytes: Uint8Array): bigint {
  return mod(leToBigint(bytes), R_J);
}

/**
 * FindGroupHash^J(D, M): the first counter byte that yields a valid point. The library
 * version always tries all 256 counters, which costs about a second. These inputs are public.
 */
export function findGroupHash(m: Uint8Array, personalization: Uint8Array): Point {
  for (let i = 0; i < 256; i += 1) {
    try {
      return jubjub_groupHash(concatBytes(m, new Uint8Array([i])), personalization);
    } catch {
      // Try the next counter.
    }
  }
  throw new Error("FindGroupHash found no point.");
}

// Fixed generators (encodings checked against zcash-test-vectors in tests/sapling.test.ts).
const FIXED = {
  spendAuth: "30b5f2aaad325630bcdddbce4d67656d05fd1cc2d037bb5375b6e96d9e01a1d7",
  proofGen: "e7e85de0f7f97a46d249a1f5ea51df50cc48490f8401c9de7a2adf1807d1b6d4",
  pedersenR: "ac776c796563fcd44cc49cfaea8bb796952c266e47779d94574c10ad01754b11",
};
let generators: { spendAuth: Point; proofGen: Point; pedersenR: Point; pedersen: Point[] } | null = null;
function gens() {
  if (!generators) {
    generators = {
      spendAuth: jubjub.Point.fromHex(FIXED.spendAuth),
      proofGen: jubjub.Point.fromHex(FIXED.proofGen),
      pedersenR: jubjub.Point.fromHex(FIXED.pedersenR),
      pedersen: [0, 1, 2, 3].map((i) => findGroupHash(bigintToLe(BigInt(i), 4), enc("Zcash_PH"))),
    };
  }
  return generators;
}

/** Exposed for test-vector checks. */
export function saplingGenerators() {
  const g = gens();
  return { spendAuth: g.spendAuth, proofGen: g.proofGen, pedersenR: g.pedersenR, pedersen: g.pedersen };
}

export function pointBytes(point: Point): Uint8Array {
  return point.toBytes();
}

/** abst_J: decode a canonical Jubjub encoding, or null. */
export function decodePoint(bytes: Uint8Array): Point | null {
  try {
    return jubjub.Point.fromHex(bytes, false);
  } catch {
    return null;
  }
}

/** DiversifyHash^Sapling(d) = GroupHash^J("Zcash_gd", d), or null when invalid. */
export function diversifyHash(d: Uint8Array): Point | null {
  try {
    const p = jubjub_groupHash(d, enc("Zcash_gd"));
    return p.equals(ZERO_POINT) ? null : p;
  } catch {
    return null;
  }
}

/** CRH^ivk(ak, nk) = BLAKE2s-256("Zcashivk", ak || nk) mod 2^251. */
export function ivkFrom(ak: Uint8Array, nk: Uint8Array): bigint {
  const h = blake2s(concatBytes(ak, nk), { personalization: enc("Zcashivk") });
  return leToBigint(h) & ((1n << 251n) - 1n);
}

export type SaplingSpendingKey = { ask: bigint; nsk: bigint; ovk: Uint8Array; ak: Uint8Array; nk: Uint8Array; ivk: bigint };

/** Derives the expanded key parts from a 32-byte Sapling spending key (spec 4.2.2). */
export function keysFromSpendingKey(sk: Uint8Array): SaplingSpendingKey {
  const ask = toScalar(prfExpand(sk, new Uint8Array([0])));
  const nsk = toScalar(prfExpand(sk, new Uint8Array([1])));
  const ovk = prfExpand(sk, new Uint8Array([2])).slice(0, 32);
  const g = gens();
  const ak = g.spendAuth.multiply(ask).toBytes();
  const nk = g.proofGen.multiply(nsk).toBytes();
  return { ask, nsk, ovk, ak, nk, ivk: ivkFrom(ak, nk) };
}

export type SaplingAddress = { d: Uint8Array; pkd: Uint8Array };

export function addressFromIvk(ivk: bigint, d: Uint8Array): SaplingAddress | null {
  const gd = diversifyHash(d);
  if (!gd || ivk === 0n) return null;
  return { d, pkd: gd.multiply(ivk).toBytes() };
}

/** Raw 43-byte Sapling receiver: d || repr_J(pk_d). */
export function rawAddress(address: SaplingAddress): Uint8Array {
  return concatBytes(address.d, address.pkd);
}

export function splitRawAddress(raw: Uint8Array): SaplingAddress {
  if (raw.length !== 43) throw new Error("A Sapling receiver is 43 bytes.");
  return { d: raw.slice(0, 11), pkd: raw.slice(11) };
}

/** True when the receiver (d, pk_d) belongs to this incoming viewing key. */
export function addressMatchesIvk(address: SaplingAddress, ivk: bigint): boolean {
  const derived = addressFromIvk(ivk, address.d);
  return Boolean(derived && bytesToHex(derived.pkd) === bytesToHex(address.pkd));
}

// Pedersen hash (spec 5.4.1.7), used by the Sapling note commitment.
function bitsLE(bytes: Uint8Array): number[] {
  const out: number[] = [];
  for (const byte of bytes) for (let i = 0; i < 8; i += 1) out.push((byte >> i) & 1);
  return out;
}

function pedersenHashToPoint(bits: number[]): Point {
  const padded = [...bits];
  while (padded.length % 3 !== 0) padded.push(0);
  const chunks = padded.length / 3;
  const g = gens();
  let acc = ZERO_POINT;
  for (let segment = 0; segment * 63 < chunks; segment += 1) {
    let sum = 0n;
    const end = Math.min(chunks, (segment + 1) * 63);
    for (let j = segment * 63; j < end; j += 1) {
      const [b0, b1, b2] = padded.slice(j * 3, j * 3 + 3);
      const value = BigInt((1 - 2 * b2) * (1 + b0 + 2 * b1));
      sum += value * (1n << BigInt(4 * (j - segment * 63)));
    }
    const generator = g.pedersen[segment] ?? findGroupHash(bigintToLe(BigInt(segment), 4), enc("Zcash_PH"));
    const scalar = mod(sum, R_J);
    if (scalar !== 0n) acc = acc.add(generator.multiply(scalar));
  }
  return acc;
}

/** cm_u of NoteCommit^Sapling_rcm(g_d, pk_d, v), as 32 little-endian bytes. */
export function noteCommitment(gd: Uint8Array, pkd: Uint8Array, value: bigint, rcm: bigint): Uint8Array {
  const bits = [1, 1, 1, 1, 1, 1, ...bitsLE(bigintToLe(value, 8)), ...bitsLE(gd), ...bitsLE(pkd)];
  let point = pedersenHashToPoint(bits);
  if (rcm !== 0n) point = point.add(gens().pedersenR.multiply(mod(rcm, R_J)));
  return bigintToLe(point.toAffine().x, 32);
}

function kdf(sharedSecret: Point, epkBytes: Uint8Array): Uint8Array {
  return blake2b(concatBytes(sharedSecret.toBytes(), epkBytes), { dkLen: 32, personalization: enc("Zcash_SaplingKDF") });
}

export function ock(ovk: Uint8Array, cv: Uint8Array, cmu: Uint8Array, epk: Uint8Array): Uint8Array {
  return blake2b(concatBytes(ovk, cv, cmu, epk), { dkLen: 32, personalization: enc("Zcash_Derive_ock") });
}

const NONCE = new Uint8Array(12);

export type SaplingOutput = { cv?: Uint8Array; cmu: Uint8Array; epk: Uint8Array; encCiphertext: Uint8Array; outCiphertext?: Uint8Array };

export type DecryptedNote = {
  address: SaplingAddress;
  value: bigint;
  rseed: Uint8Array;
  /** Present only when the full 580-byte ciphertext was available. */
  memo: Uint8Array | null;
};

/** Parses and checks a note plaintext against the commitment and the ephemeral key (ZIP 212). */
export type DecryptOptions = {
  /**
   * Accept pre-Canopy notes (lead byte 0x01, rseed is rcm). The chain has rejected them since
   * the ZIP 212 grace period ended, so this is only for the official legacy test vectors.
   */
  allowLegacy?: boolean;
};

function checkPlaintext(
  plain: Uint8Array,
  pkd: Uint8Array | null,
  ivk: bigint | null,
  output: SaplingOutput,
  epk: Point,
  esk: bigint | undefined,
  options: DecryptOptions,
): DecryptedNote | null {
  const lead = plain[0];
  if (lead !== 0x02 && !(lead === 0x01 && options.allowLegacy)) return null;
  const d = plain.slice(1, 12);
  const value = leToBigint(plain.slice(12, 20));
  const rseed = plain.slice(20, 52);
  const gd = diversifyHash(d);
  if (!gd) return null;
  const recipientPkd = pkd ?? (ivk !== null ? gd.multiply(ivk).toBytes() : null);
  if (!recipientPkd) return null;
  let rcm: bigint;
  if (lead === 0x02) {
    const derivedEsk = toScalar(prfExpand(rseed, new Uint8Array([5])));
    if (esk !== undefined && derivedEsk !== esk) return null;
    // ZIP 212: the ephemeral key must be derived from rseed. This binds epk to the note.
    if (!gd.multiply(derivedEsk).equals(epk)) return null;
    rcm = toScalar(prfExpand(rseed, new Uint8Array([4])));
  } else {
    rcm = leToBigint(rseed);
    if (rcm >= R_J) return null;
  }
  const cmu = noteCommitment(gd.toBytes(), recipientPkd, value, rcm);
  if (bytesToHex(cmu) !== bytesToHex(output.cmu)) return null;
  return { address: { d, pkd: recipientPkd }, value, rseed, memo: plain.length >= 564 ? plain.slice(52, 564) : null };
}

/**
 * Trial-decrypts an output with an incoming viewing key. Accepts the full 580-byte ciphertext,
 * or the 52-byte compact prefix from lightwalletd (no memo, no tag, still commitment-checked).
 */
export function decryptIncoming(output: SaplingOutput, ivk: bigint, options: DecryptOptions = {}): DecryptedNote | null {
  const epk = decodePoint(output.epk);
  if (!epk) return null;
  const cleared = epk.multiply(8n);
  if (cleared.equals(ZERO_POINT)) return null;
  const shared = cleared.multiply(ivk);
  const key = kdf(shared, output.epk);
  let plain: Uint8Array;
  if (output.encCiphertext.length === 580) {
    try {
      plain = chacha20poly1305(key, NONCE).decrypt(output.encCiphertext);
    } catch {
      return null;
    }
  } else if (output.encCiphertext.length === 52) {
    plain = chacha20(key, NONCE, output.encCiphertext, new Uint8Array(52), 1);
  } else {
    return null;
  }
  return checkPlaintext(plain, null, ivk, output, epk, undefined, options);
}

/** Recovers a note this wallet sent, using its outgoing viewing key (spec 4.20.3). */
export function recoverOutgoing(output: SaplingOutput, ovk: Uint8Array, options: DecryptOptions = {}): DecryptedNote | null {
  if (!output.cv || !output.outCiphertext || output.encCiphertext.length !== 580) return null;
  const epk = decodePoint(output.epk);
  if (!epk) return null;
  let op: Uint8Array;
  try {
    op = chacha20poly1305(ock(ovk, output.cv, output.cmu, output.epk), NONCE).decrypt(output.outCiphertext);
  } catch {
    return null;
  }
  const pkdBytes = op.slice(0, 32);
  const esk = leToBigint(op.slice(32, 64));
  if (esk >= R_J) return null;
  const pkd = decodePoint(pkdBytes);
  if (!pkd || esk === 0n) return null;
  const shared = pkd.multiply(8n).multiply(esk);
  let plain: Uint8Array;
  try {
    plain = chacha20poly1305(kdf(shared, output.epk), NONCE).decrypt(output.encCiphertext);
  } catch {
    return null;
  }
  return checkPlaintext(plain, pkdBytes, null, output, epk, esk, options);
}

/**
 * Builds an encrypted Sapling output to a recipient. Used by tests to make real
 * transactions that the decryptor must accept or reject. Not a wallet: no proofs, no cv.
 */
export function encryptNote(input: { address: SaplingAddress; value: bigint; rseed: Uint8Array; memo: Uint8Array; ovk?: Uint8Array; cv?: Uint8Array }): SaplingOutput {
  const gd = diversifyHash(input.address.d);
  const pkd = decodePoint(input.address.pkd);
  if (!gd || !pkd) throw new Error("Invalid recipient.");
  const memo = new Uint8Array(512);
  memo.set(input.memo.slice(0, 512));
  if (input.memo.length < 512) memo[input.memo.length] = 0;
  const esk = toScalar(prfExpand(input.rseed, new Uint8Array([5])));
  const rcm = toScalar(prfExpand(input.rseed, new Uint8Array([4])));
  const epk = gd.multiply(esk);
  const epkBytes = epk.toBytes();
  const cmu = noteCommitment(gd.toBytes(), input.address.pkd, input.value, rcm);
  const plain = concatBytes(new Uint8Array([2]), input.address.d, bigintToLe(input.value, 8), input.rseed, memo);
  const shared = pkd.multiply(8n).multiply(esk);
  const encCiphertext = chacha20poly1305(kdf(shared, epkBytes), NONCE).encrypt(plain);
  const cv = input.cv ?? new Uint8Array(32);
  const outCiphertext = input.ovk
    ? chacha20poly1305(ock(input.ovk, cv, cmu, epkBytes), NONCE).encrypt(concatBytes(input.address.pkd, bigintToLe(esk, 32)))
    : new Uint8Array(80);
  return { cv, cmu, epk: epkBytes, encCiphertext, outCiphertext };
}

/** Memo bytes to text. A 0xF6 first byte means "no memo". Trailing zero bytes are padding. */
export function memoText(memo: Uint8Array | null): string | null {
  if (!memo || memo[0] === 0xf6) return null;
  if (memo[0] > 0xf4) return null;
  let end = memo.length;
  while (end > 0 && memo[end - 1] === 0) end -= 1;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(memo.slice(0, end));
  } catch {
    return null;
  }
}

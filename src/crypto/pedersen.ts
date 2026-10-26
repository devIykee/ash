import { ristretto255, ristretto255_hasher } from "@noble/curves/ed25519.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { canonicalJson } from "@/domain/canonical";
import { AshError } from "@/domain/errors";

const Point = ristretto255.Point;
type RistPoint = InstanceType<typeof Point>;

const ORDER = Point.Fn.ORDER;
const G = Point.BASE;
// The hasher's public type is the RFC 9380 point interface. The implementation returns a ristretto point.
const H = ristretto255_hasher.hashToCurve(utf8ToBytes("ash-pedersen-h-v1")) as RistPoint;

if (H.equals(G) || H.equals(Point.ZERO)) {
  throw new Error("Pedersen generator H is not independent.");
}

export type SumProof = {
  system: "ristretto255-pedersen-schnorr";
  version: "ash-sum-v1";
  context: string;
  commitments: string[];
  totalZatoshi: string;
  R: string;
  s: string;
  statement: string;
  doesNotProve: string;
};

function randomScalar(): bigint {
  const bytes = randomBytes(64);
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) + BigInt(byte);
  const scalar = value % ORDER;
  return scalar === 0n ? randomScalar() : scalar;
}

function commit(amount: bigint, blinding: bigint): RistPoint {
  return H.multiply(Point.Fn.create(amount)).add(G.multiply(Point.Fn.create(blinding)));
}

function challenge(R: RistPoint, C: RistPoint, total: bigint, context: string, commitments: string[]): bigint {
  const digest = sha512(
    utf8ToBytes(
      canonicalJson({
        v: "ash-sum-v1",
        R: bytesToHex(R.toRawBytes()),
        C: bytesToHex(C.toRawBytes()),
        total: total.toString(),
        context,
        commitments,
      }),
    ),
  );
  let value = 0n;
  for (const byte of digest) value = (value << 8n) + BigInt(byte);
  const scalar = value % ORDER;
  if (scalar === 0n) throw new Error("Fiat-Shamir challenge collapsed.");
  return scalar;
}

export function proveAmountSum(amounts: bigint[], context: string): SumProof {
  if (amounts.length === 0) throw new AshError("invalid_proof", "A sum proof needs at least one amount.");
  if (amounts.some((amount) => amount < 0n)) throw new AshError("invalid_proof", "Amounts must be non-negative.");
  const blindings = amounts.map(() => randomScalar());
  const points = amounts.map((amount, index) => commit(amount, blindings[index]));
  const commitments = points.map((point) => bytesToHex(point.toRawBytes()));
  const total = amounts.reduce((sum, amount) => sum + amount, 0n);
  const blinding = blindings.reduce((sum, value) => (sum + value) % ORDER, 0n);
  const C = points.reduce((sum, point) => sum.add(point), Point.ZERO);
  if (!C.equals(commit(total, blinding))) throw new Error("commitment sum mismatch");
  const nonce = randomScalar();
  const R = G.multiply(Point.Fn.create(nonce));
  const e = challenge(R, C, total, context, commitments);
  const s = (nonce + e * blinding) % ORDER;
  return {
    system: "ristretto255-pedersen-schnorr",
    version: "ash-sum-v1",
    context,
    commitments,
    totalZatoshi: total.toString(),
    R: bytesToHex(R.toRawBytes()),
    s: s.toString(),
    statement:
      "The prover knows openings of these Pedersen commitments whose amounts add up to totalZatoshi. Individual amounts are not revealed.",
    doesNotProve:
      "This is not a Zcash Halo 2 proof. It does not prove that anyone was paid, that the commitments match a payroll the prover will execute, or that the amounts are fair.",
  };
}

export function verifyAmountSum(proof: SumProof): { valid: boolean; reason: string } {
  try {
    if (proof.system !== "ristretto255-pedersen-schnorr" || proof.version !== "ash-sum-v1") {
      return { valid: false, reason: "Unknown proof system." };
    }
    if (proof.commitments.length === 0) return { valid: false, reason: "No commitments." };
    const total = BigInt(proof.totalZatoshi);
    const s = BigInt(proof.s);
    if (total < 0n || s <= 0n || s >= ORDER) return { valid: false, reason: "Proof scalars are out of range." };
    const points = proof.commitments.map((hex) => Point.fromHex(hex));
    const C = points.reduce((sum, point) => sum.add(point), Point.ZERO);
    const R = Point.fromHex(proof.R);
    const e = challenge(R, C, total, proof.context, proof.commitments);
    const lhs = G.multiply(Point.Fn.create(s));
    const rhs = R.add(C.subtract(H.multiply(Point.Fn.create(total))).multiply(Point.Fn.create(e)));
    if (!lhs.equals(rhs)) return { valid: false, reason: "Proof equation failed." };
    return { valid: true, reason: "The sum equation holds for these commitments." };
  } catch {
    return { valid: false, reason: "Proof encoding is invalid." };
  }
}

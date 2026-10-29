// Reads the Sapling outputs of a raw Zcash transaction (v4 Sapling, v5 NU5, and v6).
// Spec sections 7.1 and ZIP 225. Everything after the Sapling outputs is skipped.
// v6 transactions on testnet use the v5 layout up to the Sapling outputs (checked against
// live testnet data). A misread can only fail safely: every decrypted note must match its
// on-chain commitment.
import type { SaplingOutput } from "./sapling";

class Reader {
  constructor(
    private bytes: Uint8Array,
    public offset = 0,
  ) {}

  take(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) throw new Error("Transaction is truncated.");
    const out = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return out;
  }

  u32(): number {
    const b = this.take(4);
    return (b[0] | (b[1] << 8) | (b[2] << 16)) + b[3] * 2 ** 24;
  }

  compactSize(): number {
    const first = this.take(1)[0];
    if (first < 0xfd) return first;
    if (first === 0xfd) {
      const b = this.take(2);
      return b[0] | (b[1] << 8);
    }
    if (first === 0xfe) return this.u32();
    throw new Error("Count too large.");
  }

  skipTransparent(): void {
    const inputs = this.compactSize();
    for (let i = 0; i < inputs; i += 1) {
      this.take(36);
      this.take(this.compactSize());
      this.take(4);
    }
    const outputs = this.compactSize();
    for (let i = 0; i < outputs; i += 1) {
      this.take(8);
      this.take(this.compactSize());
    }
  }
}

export type ParsedTransaction = { version: number; saplingOutputs: SaplingOutput[] };

export function parseTransaction(raw: Uint8Array): ParsedTransaction {
  const r = new Reader(raw);
  const header = r.u32();
  const overwintered = header >= 0x80000000;
  const version = header & 0x7fffffff;
  if (!overwintered || (version !== 4 && version !== 5 && version !== 6)) {
    return { version, saplingOutputs: [] };
  }
  r.take(4); // nVersionGroupId
  const outputs: SaplingOutput[] = [];
  if (version === 4) {
    r.skipTransparent();
    r.take(4); // nLockTime
    r.take(4); // nExpiryHeight
    r.take(8); // valueBalanceSapling
    const spends = r.compactSize();
    r.take(spends * 384);
    const count = r.compactSize();
    for (let i = 0; i < count; i += 1) {
      const cv = r.take(32);
      const cmu = r.take(32);
      const epk = r.take(32);
      const encCiphertext = r.take(580);
      const outCiphertext = r.take(80);
      r.take(192); // zkproof
      outputs.push({ cv, cmu, epk, encCiphertext, outCiphertext });
    }
    return { version, saplingOutputs: outputs };
  }
  r.take(4); // nConsensusBranchId
  r.take(4); // nLockTime
  r.take(4); // nExpiryHeight
  r.skipTransparent();
  const spends = r.compactSize();
  r.take(spends * 96); // cv, nullifier, rk
  const count = r.compactSize();
  for (let i = 0; i < count; i += 1) {
    const cv = r.take(32);
    const cmu = r.take(32);
    const epk = r.take(32);
    const encCiphertext = r.take(580);
    const outCiphertext = r.take(80);
    outputs.push({ cv, cmu, epk, encCiphertext, outCiphertext });
  }
  return { version, saplingOutputs: outputs };
}

/** Display txids are the byte-reversed hash. */
export function txidToBytes(txid: string): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) bytes[i] = Number.parseInt(txid.slice(i * 2, i * 2 + 2), 16);
  return bytes.reverse();
}

export function bytesToTxid(bytes: Uint8Array): string {
  return [...bytes]
    .reverse()
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

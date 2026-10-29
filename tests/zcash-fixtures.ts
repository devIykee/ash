// Real Sapling wallets and transactions for tests. Outputs are genuinely encrypted, so the
// verifier must decrypt them and match their commitments. No proofs: ASH does not check them.
import { bech32 } from "bech32";
import { bytesToHex, concatBytes, randomBytes } from "@noble/hashes/utils.js";
import type { Network } from "@/domain/types";
import { addressFromIvk, diversifyHash, encryptNote, keysFromSpendingKey, type SaplingAddress, type SaplingOutput } from "@/zcash/sapling";
import { encodeSaplingAddress } from "@/zcash/unified";

export type TestWallet = { address: string; sapling: SaplingAddress; viewingKey: string; incomingOnlyKey: string; ivk: bigint; ovk: Uint8Array };

/** A fresh Sapling wallet: address plus a ZIP 32 extended full viewing key encoding. */
export function makeWallet(network: Network): TestWallet {
  const keys = keysFromSpendingKey(randomBytes(32));
  let d = randomBytes(11);
  while (!diversifyHash(d)) d = randomBytes(11);
  const sapling = addressFromIvk(keys.ivk, d)!;
  const fvk = concatBytes(new Uint8Array(41), keys.ak, keys.nk, keys.ovk, randomBytes(32));
  const viewingKey = bech32.encode(network === "mainnet" ? "zxviews" : "zxviewtestsapling", bech32.toWords(fvk), 4096);
  return { address: encodeSaplingAddress(sapling, network), sapling, viewingKey, incomingOnlyKey: viewingKey, ivk: keys.ivk, ovk: keys.ovk };
}

export function payment(to: SaplingAddress, value: bigint, memo: string, fromOvk?: Uint8Array): SaplingOutput {
  return encryptNote({ address: to, value, rseed: randomBytes(32), memo: new TextEncoder().encode(memo), ovk: fromOvk, cv: randomBytes(32) });
}

/** A v5 transaction with only Sapling outputs. Enough for ASH's parser. */
export function buildTx(outputs: SaplingOutput[]): Uint8Array {
  const parts: Uint8Array[] = [
    new Uint8Array([0x05, 0, 0, 0x80]),
    new Uint8Array([0xf5, 0x2f, 0x9a, 0x26]),
    new Uint8Array(4),
    new Uint8Array(4),
    new Uint8Array(4),
    new Uint8Array([0, 0, 0, outputs.length]),
  ];
  for (const o of outputs) parts.push(o.cv ?? new Uint8Array(32), o.cmu, o.epk, o.encCiphertext, o.outCiphertext ?? new Uint8Array(80));
  return concatBytes(...parts, new Uint8Array(16));
}

/** In-memory chain served through a mocked lightwalletd. */
export class FakeChain {
  tip = 1000;
  txs = new Map<string, { data: Uint8Array; height: number | null; outputs: SaplingOutput[] }>();

  /** Mines a transaction at the current tip (or leaves it in the mempool) and returns its display txid. */
  add(outputs: SaplingOutput[], mined = true): string {
    const raw = randomBytes(32);
    const data = buildTx(outputs);
    if (mined) this.tip += 1;
    this.txs.set(bytesToHex(raw), { data, height: mined ? this.tip : null, outputs });
    return [...raw].reverse().map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  mine(blocks = 1): void {
    this.tip += blocks;
  }

  mock() {
    const LightwalletdError = class LightwalletdError extends Error {};
    return {
      DEFAULT_LIGHTWALLETD: { testnet: "https://test.invalid", mainnet: "https://main.invalid" },
      LightwalletdError,
      getLatestHeight: async () => this.tip,
      getTransaction: async (_url: string, txidBytes: Uint8Array) => {
        const found = this.txs.get(bytesToHex(txidBytes));
        if (!found) throw new LightwalletdError("transaction not found");
        return { data: found.data, height: found.height };
      },
      getBlockRange: async (_url: string, start: number, end: number) => {
        const blocks = [];
        for (const [hex, tx] of this.txs) {
          if (tx.height === null || tx.height < start || tx.height > end) continue;
          const txidBytes = Uint8Array.from(hex.match(/../g)!.map((h) => Number.parseInt(h, 16)));
          blocks.push({
            height: tx.height,
            txs: [{ txidBytes, outputs: tx.outputs.map((o) => ({ cmu: o.cmu, epk: o.epk, ciphertext: o.encCiphertext.slice(0, 52) })) }],
          });
        }
        return blocks;
      },
      getLightdInfo: async () => ({ chainName: "test", blockHeight: this.tip, vendor: "fake" }),
    };
  }
}

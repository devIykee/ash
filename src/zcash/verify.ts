// Verifies real shielded payments from chain data served by lightwalletd.
// Trust: lightwalletd is trusted to report the chain honestly (heights and transaction bytes),
// as with any light client that does not validate headers. Amounts, recipients, and memos are
// checked cryptographically: every note must decrypt and match its on-chain commitment.
import { bytesToHex } from "@noble/hashes/utils.js";
import { getBlockRange, getLatestHeight, getTransaction, LightwalletdError, type RawTx } from "./lightwalletd";
import { decryptIncoming, memoText, recoverOutgoing, type SaplingAddress } from "./sapling";
import { bytesToTxid, parseTransaction, txidToBytes } from "./transaction";

export type ExpectedPayment = {
  ivk: bigint;
  address: SaplingAddress;
  minZatoshi: bigint;
  /** Text that must appear in the memo. Binds the payment to one request. */
  memoRef: string;
};

export type PaymentMatch = {
  txid: string;
  outputIndex: number;
  valueZatoshi: bigint;
  memo: string | null;
  height: number | null;
  confirmations: number;
};

export type CheckResult =
  | { status: "matched"; match: PaymentMatch }
  | { status: "not_found"; reason: string }
  | { status: "mismatch"; reason: string };

const sameAddress = (a: SaplingAddress, b: SaplingAddress) => bytesToHex(a.d) === bytesToHex(b.d) && bytesToHex(a.pkd) === bytesToHex(b.pkd);

function confirmationsFor(height: number | null, tip: number): number {
  return height === null ? 0 : Math.max(0, tip - height + 1);
}

/** Decrypts every Sapling output of one transaction and returns the one that pays the request. */
function matchInTransaction(raw: RawTx, txid: string, expected: ExpectedPayment, tip: number): CheckResult {
  let parsed: ReturnType<typeof parseTransaction>;
  try {
    parsed = parseTransaction(raw.data);
  } catch {
    return { status: "mismatch", reason: "ASH could not read this transaction's format." };
  }
  let sawPaymentToUs = false;
  let wrongMemo = false;
  let tooLittle: bigint | null = null;
  for (const [index, output] of parsed.saplingOutputs.entries()) {
    const note = decryptIncoming(output, expected.ivk);
    if (!note || !sameAddress(note.address, expected.address)) continue;
    sawPaymentToUs = true;
    const memo = memoText(note.memo);
    if (!memo || !memo.includes(expected.memoRef)) {
      wrongMemo = true;
      continue;
    }
    if (note.value < expected.minZatoshi) {
      tooLittle = note.value;
      continue;
    }
    return {
      status: "matched",
      match: { txid, outputIndex: index, valueZatoshi: note.value, memo, height: raw.height, confirmations: confirmationsFor(raw.height, tip) },
    };
  }
  if (tooLittle !== null) return { status: "mismatch", reason: `This transaction pays ${tooLittle} zatoshi, less than the ${expected.minZatoshi} requested.` };
  if (wrongMemo) return { status: "mismatch", reason: `This transaction pays the address, but its memo does not contain the reference ${expected.memoRef}.` };
  if (!sawPaymentToUs) {
    return parsed.saplingOutputs.length === 0
      ? { status: "mismatch", reason: "This transaction has no Sapling output. Pay the Sapling address in the request." }
      : { status: "mismatch", reason: "This transaction does not pay the requested address." };
  }
  return { status: "mismatch", reason: "This transaction does not match the request." };
}

/** Checks one transaction id against a payment request. */
export async function checkTransaction(url: string, txid: string, expected: ExpectedPayment): Promise<CheckResult> {
  let raw: RawTx;
  try {
    raw = await getTransaction(url, txidToBytes(txid));
  } catch (error) {
    if (error instanceof LightwalletdError && /not found|NotFound|transaction/i.test(error.message)) {
      return { status: "not_found", reason: "The network does not know this transaction yet. Check the id, or wait a few seconds after sending." };
    }
    throw error;
  }
  const tip = await getLatestHeight(url);
  return matchInTransaction(raw, txid, expected, tip);
}

export type ScanResult = { result: CheckResult; scannedTo: number; tip: number };

/**
 * Looks for a payment in recent blocks. Compact outputs are trial-decrypted (commitment-checked);
 * a candidate's full transaction is then fetched to read the memo.
 */
export async function scanForPayment(url: string, expected: ExpectedPayment, fromHeight: number, maxBlocks = 720): Promise<ScanResult> {
  const tip = await getLatestHeight(url);
  const start = Math.max(1, fromHeight);
  const end = Math.min(tip, start + maxBlocks - 1);
  if (start > end) return { result: { status: "not_found", reason: "No new blocks yet." }, scannedTo: tip, tip };
  let mismatch: CheckResult | null = null;
  for (let low = start; low <= end; low += 200) {
    const high = Math.min(end, low + 199);
    const blocks = await getBlockRange(url, low, high);
    for (const block of blocks) {
      for (const tx of block.txs) {
        const hit = tx.outputs.some((output) => {
          if (output.ciphertext.length !== 52) return false;
          const note = decryptIncoming({ cmu: output.cmu, epk: output.epk, encCiphertext: output.ciphertext }, expected.ivk);
          return Boolean(note && sameAddress(note.address, expected.address));
        });
        if (!hit) continue;
        const txid = bytesToTxid(tx.txidBytes);
        const raw = await getTransaction(url, tx.txidBytes);
        const result = matchInTransaction(raw, txid, expected, tip);
        if (result.status === "matched") return { result, scannedTo: block.height, tip };
        mismatch = result;
      }
    }
  }
  return {
    result: mismatch ?? { status: "not_found", reason: "No matching payment has reached a block yet." },
    scannedTo: end,
    tip,
  };
}

export type OutgoingLine = { id: string; address: SaplingAddress; minZatoshi: bigint };
export type OutgoingMatch = { lineId: string; outputIndex: number; valueZatoshi: bigint; memo: string | null };

/** Recovers this wallet's outgoing notes in one transaction (outgoing viewing key) and matches payroll lines. */
export async function checkOutgoing(
  url: string,
  txid: string,
  ovk: Uint8Array,
  lines: OutgoingLine[],
): Promise<{ status: "found"; height: number | null; confirmations: number; matches: OutgoingMatch[] } | { status: "not_found"; reason: string }> {
  let raw: RawTx;
  try {
    raw = await getTransaction(url, txidToBytes(txid));
  } catch (error) {
    if (error instanceof LightwalletdError) return { status: "not_found", reason: "The network does not know this transaction yet." };
    throw error;
  }
  const tip = await getLatestHeight(url);
  let parsed: ReturnType<typeof parseTransaction>;
  try {
    parsed = parseTransaction(raw.data);
  } catch {
    return { status: "not_found", reason: "ASH could not read this transaction's format." };
  }
  const used = new Set<string>();
  const matches: OutgoingMatch[] = [];
  const notes = parsed.saplingOutputs.map((output, index) => ({ index, note: recoverOutgoing(output, ovk) }));
  for (const line of lines) {
    const found = notes.find(({ index, note }) => note && !used.has(String(index)) && sameAddress(note.address, line.address) && note.value >= line.minZatoshi);
    if (!found?.note) continue;
    used.add(String(found.index));
    matches.push({ lineId: line.id, outputIndex: found.index, valueZatoshi: found.note.value, memo: memoText(found.note.memo) });
  }
  return { status: "found", height: raw.height, confirmations: confirmationsFor(raw.height, tip), matches };
}

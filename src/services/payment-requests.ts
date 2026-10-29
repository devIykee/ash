// Real shielded payment requests for testnet and mainnet.
// A request names the payee's verified Sapling address, an amount, and a unique memo reference.
// The payer's own wallet builds and broadcasts the transaction. ASH finds it on chain, decrypts
// it with the payee's viewing key, and unlocks the operation once it has enough confirmations.
import { randomBytes } from "@noble/hashes/utils.js";
import { AshError } from "@/domain/errors";
import { nowIso } from "@/domain/ids";
import { paymentResult } from "@/domain/payment";
import type { Mode, Network, PaymentRecord } from "@/domain/types";
import { config } from "@/server/config";
import { getStore } from "@/server/store";
import type { Tx } from "@/store/types";
import { getLatestHeight, LightwalletdError } from "@/zcash/lightwalletd";
import { checkTransaction, scanForPayment, type CheckResult } from "@/zcash/verify";
import { buildZip321 } from "@/zcash/zip321";
import { mustGet } from "./common";
import { payoutAddress, verifyingKey } from "./wallet-keys";

export type Purpose = "tip" | "exchange" | "renewal" | "api";

export type PaymentRequest = {
  ref: string;
  operationId: string;
  purpose: Purpose;
  mode: Mode;
  network: Network;
  payeeId: string;
  address: string;
  amountZatoshi: string;
  memo: string;
  label: string;
  createdAt: string;
  startHeight: number | null;
  scannedTo: number | null;
  status: "open" | "confirming" | "confirmed";
  match: { txid: string; outputIndex: number; valueZatoshi: string; height: number | null; confirmations: number } | null;
  appliedAt: string | null;
  lastReason: string | null;
  checkedAt: string | null;
  /** What the flow produced once confirmed, such as a receipt id. */
  resultRef: string | null;
};

export type PublicRequest = Pick<
  PaymentRequest,
  "ref" | "operationId" | "purpose" | "network" | "address" | "amountZatoshi" | "memo" | "label" | "status" | "match" | "lastReason" | "checkedAt" | "resultRef"
> & { uri: string; requiredConfirmations: number };

/** Applies a seen or confirmed payment to the operation. May return a result reference. */
type Handler = (tx: Tx, request: PaymentRequest, payment: PaymentRecord) => Promise<string | void>;
const handlers = new Map<Purpose, Handler>();

/** Each flow registers what happens when its payment is seen or confirmed. */
export function onPayment(purpose: Purpose, handler: Handler): void {
  handlers.set(purpose, handler);
}

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function newRef(): string {
  const bytes = randomBytes(10);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function publicRequest(request: PaymentRequest): PublicRequest {
  return {
    ref: request.ref,
    operationId: request.operationId,
    purpose: request.purpose,
    network: request.network,
    address: request.address,
    amountZatoshi: request.amountZatoshi,
    memo: request.memo,
    label: request.label,
    status: request.status,
    match: request.match,
    lastReason: request.lastReason,
    checkedAt: request.checkedAt,
    resultRef: request.resultRef ?? null,
    uri: buildZip321([{ address: request.address, amountZatoshi: BigInt(request.amountZatoshi), memo: request.memo, label: request.label }], request.network),
    requiredConfirmations: config(request.mode).requiredConfirmations,
  };
}

export async function createPaymentRequest(
  tx: Tx,
  input: { operationId: string; purpose: Purpose; payeeId: string; amountZatoshi: bigint; label: string },
): Promise<PaymentRequest> {
  const cfg = config();
  if (cfg.allowSimulated) throw new AshError("invalid_state", "Practice mode records practice payments, not network payments.", 409);
  if (input.amountZatoshi <= 0n) throw new AshError("invalid_amount", "The amount must be greater than zero.");
  const address = await payoutAddress(tx, input.payeeId, cfg.network);
  if (!address) {
    throw new AshError("payee_key_missing", `The person being paid has not added a ${cfg.network} receiving key in Settings, so ASH cannot verify a payment to them yet.`, 409);
  }
  const ref = newRef();
  const request: PaymentRequest = {
    ref,
    operationId: input.operationId,
    purpose: input.purpose,
    mode: cfg.mode,
    network: cfg.network,
    payeeId: input.payeeId,
    address,
    amountZatoshi: input.amountZatoshi.toString(),
    memo: `ASH ${ref}`,
    label: input.label.slice(0, 60),
    createdAt: nowIso(),
    startHeight: null,
    scannedTo: null,
    status: "open",
    match: null,
    appliedAt: null,
    lastReason: null,
    checkedAt: null,
    resultRef: null,
  };
  await tx.put("payment_request", ref, request, null);
  await tx.put("operation_request", input.operationId, { ref }, (await tx.get("operation_request", input.operationId))?.version ?? null);
  return request;
}

export async function requestForOperation(tx: Tx, operationId: string): Promise<PaymentRequest | null> {
  const pointer = await tx.get<{ ref: string }>("operation_request", operationId);
  if (!pointer) return null;
  return (await tx.get<PaymentRequest>("payment_request", pointer.data.ref))?.data ?? null;
}

export async function getPaymentRequest(tx: Tx, ref: string): Promise<PaymentRequest> {
  return (await mustGet<PaymentRequest>(tx, "payment_request", ref)).data;
}

/**
 * Looks for the payment on chain and applies the result. Network calls happen outside any
 * database transaction; the result is then written in one transaction.
 */
export async function checkPaymentRequest(ref: string, txId?: string): Promise<PublicRequest> {
  const store = getStore();
  const loaded = await store.read(async (tx) => {
    const request = await getPaymentRequest(tx, ref);
    if (request.status === "confirmed" && request.appliedAt) return { request, key: null };
    const key = await verifyingKey(tx, request.payeeId, request.network);
    return { request, key };
  });
  const request = loaded.request;
  if (request.status === "confirmed" && request.appliedAt) return publicRequest(request);
  if (!loaded.key) throw new AshError("payee_key_missing", "The payee's receiving key was removed, so ASH cannot verify this payment.", 409);
  const cfg = config(request.mode);
  const expected = { ivk: loaded.key.ivk, address: loaded.key.address, minZatoshi: BigInt(request.amountZatoshi), memoRef: request.ref };

  let result: CheckResult;
  let scannedTo = request.scannedTo;
  let startHeight = request.startHeight;
  try {
    const knownTx = txId?.toLowerCase() ?? request.match?.txid;
    if (knownTx) {
      result = await checkTransaction(cfg.lightwalletdUrl, knownTx, expected);
    } else {
      // First check starts a little before the current tip; later checks continue where the last one stopped.
      if (startHeight === null) startHeight = (await getLatestHeight(cfg.lightwalletdUrl)) - 40;
      const scan = await scanForPayment(cfg.lightwalletdUrl, expected, (scannedTo ?? startHeight - 1) + 1, 720);
      result = scan.result;
      scannedTo = scan.scannedTo;
    }
  } catch (error) {
    if (error instanceof LightwalletdError) throw new AshError("network_unavailable", `ASH could not reach the Zcash ${request.network} network. ${error.message}`, 503);
    throw error;
  }

  return store.transaction(async (tx) => {
    const doc = await mustGet<PaymentRequest>(tx, "payment_request", ref);
    const current = doc.data;
    if (current.status === "confirmed" && current.appliedAt) return publicRequest(current);
    const next: PaymentRequest = {
      ...current,
      scannedTo: scannedTo === null ? current.scannedTo : Math.max(current.scannedTo ?? 0, scannedTo),
      startHeight: current.startHeight ?? startHeight,
      checkedAt: nowIso(),
    };
    if (result.status !== "matched") {
      // A pasted id that does not match must not erase an earlier good match.
      next.lastReason = result.reason;
      await tx.put("payment_request", ref, next, doc.version);
      return publicRequest(next);
    }
    const match = result.match;
    const outputKey = `${current.network}:${match.txid}:${match.outputIndex}`;
    const used = await tx.get<{ ref: string }>("used_output", outputKey);
    if (used && used.data.ref !== ref) {
      next.lastReason = "That payment was already used for another request.";
      await tx.put("payment_request", ref, next, doc.version);
      return publicRequest(next);
    }
    if (!used) await tx.put("used_output", outputKey, { ref }, null);
    const confirmed = match.confirmations >= cfg.requiredConfirmations;
    next.match = { txid: match.txid, outputIndex: match.outputIndex, valueZatoshi: match.valueZatoshi.toString(), height: match.height, confirmations: match.confirmations };
    next.status = confirmed ? "confirmed" : "confirming";
    next.lastReason = confirmed ? null : match.height === null ? "Seen in the mempool. Waiting for the first block." : `${match.confirmations} of ${cfg.requiredConfirmations} confirmations.`;
    const payment = paymentResult({
      status: confirmed ? "confirmed" : "observed",
      mode: "chain_verified",
      amountZatoshi: match.valueZatoshi.toString(),
      feeZatoshi: "0",
      network: current.network,
      txId: match.txid,
      idempotencyKey: `request:${ref}`,
      confirmations: match.confirmations,
      requiredConfirmations: cfg.requiredConfirmations,
      reason: confirmed ? "Verified on chain with the payee's viewing key: amount, recipient, and memo reference match." : next.lastReason,
    });
    const handler = handlers.get(current.purpose);
    if (handler) {
      const produced = await handler(tx, next, payment);
      if (produced) next.resultRef = produced;
    }
    if (confirmed) next.appliedAt = nowIso();
    await tx.put("payment_request", ref, next, doc.version);
    return publicRequest(next);
  });
}

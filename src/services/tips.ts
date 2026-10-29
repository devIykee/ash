import { AshError } from "@/domain/errors";
import { newId } from "@/domain/ids";
import { zatoshiToZec, zecToZatoshi } from "@/domain/money";
import { paymentSatisfies } from "@/domain/payment";
import { DISCLOSURES, type OperationRecord, type PaymentRecord } from "@/domain/types";
import { config } from "@/server/config";
import { currentMode, recordMode, withMode } from "@/server/mode";
import { signDocument, verifyDocument } from "@/crypto/sign";
import { assertShieldedDestination } from "@/zcash/address";
import { buildZip321 } from "@/zcash/zip321";
import type { Tx } from "@/store/types";
import { assertPerson, assertRole, idempotent, mustGet, requestHash, settleSimulated, type Actor } from "./common";
import { createOperation, saveOperation } from "./events";
import { createPaymentRequest, onPayment, publicRequest, type PaymentRequest } from "./payment-requests";
import { payoutAddress } from "./wallet-keys";

export type TipData = {
  operationId: string;
  creatorId: string;
  title: string;
  address: string;
  network: "mainnet" | "testnet";
  suggestedZatoshi: string[];
  statement: string;
};

export type ReceiptBody = {
  format: "ash-receipt-v1";
  id: string;
  tipId: string;
  network: "mainnet" | "testnet";
  amountZatoshi: string;
  memo: string | null;
  verificationLevel: "simulated" | "confirmed" | "observed" | "unverified";
  verificationStatement: string;
  approvedFields: string[];
  createdAt: string;
};

export type SignedReceipt = ReceiptBody & { publicKey: string; signature: string };

const APPROVED = ["format", "id", "tipId", "network", "amountZatoshi", "memo", "verificationLevel", "verificationStatement", "approvedFields", "createdAt"] as const;

function receiptFor(payment: PaymentRecord, tip: TipData, memo: string | null, includeMemo: boolean): ReceiptBody {
  const level =
    payment.mode === "simulated" && payment.status === "verified"
      ? "simulated"
      : payment.mode === "chain_verified" && payment.status === "confirmed"
        ? "confirmed"
        : payment.status === "observed"
          ? "observed"
          : "unverified";
  return {
    format: "ash-receipt-v1",
    id: newId("rcpt"),
    tipId: tip.operationId,
    network: tip.network,
    amountZatoshi: payment.amountZatoshi,
    memo: includeMemo ? memo : null,
    verificationLevel: level,
    verificationStatement:
      level === "simulated"
        ? DISCLOSURES.simulated
        : level === "confirmed"
          ? `Confirmed on Zcash ${tip.network} in transaction ${payment.txId} with ${payment.confirmations} confirmations. ASH decrypted the note with the creator's viewing key: the amount and recipient match.`
          : level === "observed"
          ? DISCLOSURES.observed
          : "ASH did not verify this payment. This receipt is not evidence of a transfer.",
    approvedFields: includeMemo ? [...APPROVED] : APPROVED.filter((field) => field !== "memo"),
    createdAt: new Date().toISOString(),
  };
}

export async function createTip(
  tx: Tx,
  actor: Actor,
  input: { title: string; address: string; suggestedZec: string[]; statement: string },
  idempotencyKey: string | null,
) {
  assertPerson(actor);
  assertRole(actor, ["creator", "operator"]);
  return idempotent(tx, `tip-create:${actor.user.id}`, idempotencyKey, requestHash(input), async () => {
    const cfg = config();
    // Real modes pay the creator's verified receiving address, never a typed one.
    const verified = cfg.allowSimulated ? null : await payoutAddress(tx, actor.user.id, cfg.network);
    if (!cfg.allowSimulated && !verified) {
      throw new AshError("payee_key_missing", `Add your ${cfg.network} receiving address and viewing key in Settings first, so ASH can verify tips to you.`, 409);
    }
    const report = assertShieldedDestination(verified ?? input.address, cfg.network);
    const suggested = input.suggestedZec.map((amount) => zecToZatoshi(amount).toString());
    if (suggested.length === 0) throw new AshError("validation_failed", "Add at least one suggested amount.");
    const id = newId("op");
    const tip: TipData = {
      operationId: id,
      creatorId: actor.user.id,
      title: input.title.trim(),
      address: report.address,
      network: cfg.network,
      suggestedZatoshi: suggested,
      statement: input.statement.trim(),
    };
    const created = await createOperation(tx, {
      id,
      type: "tip",
      state: "draft",
      initiatorId: actor.user.id,
      participantIds: [actor.user.id],
      label: tip.title,
      parentId: null,
      payment: null,
      access: null,
      disclosures: [DISCLOSURES.receipt, DISCLOSURES.orchard, report.note],
    });
    await tx.put("tip", id, tip, null);
    const published = await saveOperation(tx, created, { ...created.data, state: "awaiting_payment" }, "published", "tip page published");
    return { version: published.version, operation: published.data, tip, uri: publicTip(tip, suggested[0]) };
  });
}

export function publicTip(tip: TipData, amountZatoshi: string) {
  return {
    id: tip.operationId,
    title: tip.title,
    statement: tip.statement,
    network: tip.network,
    address: tip.address,
    suggestedZatoshi: tip.suggestedZatoshi,
    uri: buildZip321([{ address: tip.address, amountZatoshi: BigInt(amountZatoshi), label: tip.title }], tip.network),
    amountZec: zatoshiToZec(BigInt(amountZatoshi)),
    disclosures: [DISCLOSURES.receipt, DISCLOSURES.orchard, "The ZIP-321 link asks a wallet to pay. Opening it does not pay, and ASH has not seen a transaction yet."],
  };
}

export async function getTip(tx: Tx, id: string) {
  const tip = await mustGet<TipData>(tx, "tip", id);
  const page = await tx.get<OperationRecord>("operation", id);
  return { ...publicTip(tip.data, tip.data.suggestedZatoshi[0] || "0"), mode: recordMode(page?.data ?? {}) };
}

export async function listTips(tx: Tx, actor: Actor) {
  const mode = currentMode();
  const tips = await tx.list<TipData>("tip");
  const pages = await Promise.all(tips.map((tip) => tx.get<OperationRecord>("operation", tip.id)));
  return tips
    .filter((tip, index) => tip.data.creatorId === actor.user.id && recordMode(pages[index]?.data ?? {}) === mode)
    .map((tip) => ({ id: tip.id, title: tip.data.title }));
}

export async function payTip(
  tx: Tx,
  actor: Actor | null,
  id: string,
  input: { amountZec: string; memo?: string; includeMemo?: boolean },
  idempotencyKey: string | null,
) {
  // A tip page is public. Pay it in the page's own mode, whatever mode the visitor is browsing in.
  const pageRecord = await mustGet<OperationRecord>(tx, "operation", id);
  return withMode(recordMode(pageRecord.data), () => payTipInMode(tx, actor, id, input, idempotencyKey));
}

async function payTipInMode(
  tx: Tx,
  actor: Actor | null,
  id: string,
  input: { amountZec: string; memo?: string; includeMemo?: boolean },
  idempotencyKey: string | null,
) {
  return idempotent(tx, `tip-pay:${id}`, idempotencyKey, requestHash(input), async () => {
    const cfg = config();
    const page = await mustGet<OperationRecord>(tx, "operation", id);
    const tip = await mustGet<TipData>(tx, "tip", id);
    if (page.data.state !== "awaiting_payment") throw new AshError("invalid_state", "This tip page is not accepting payments.", 409);
    const amount = zecToZatoshi(input.amountZec);
    if (amount <= 0n) throw new AshError("invalid_amount", "Tip amount must be greater than zero.");
    const payer = actor ?? { kind: "user" as const, user: { id: "user_guest", name: "Guest", role: "buyer" as const, createdAt: "" } };
    if (!cfg.allowSimulated) {
      // Real payment: the supporter's wallet pays a request with a unique memo reference.
      const supporter = actor?.user.id ?? "user_guest";
      const child = await createOperation(tx, {
        id: newId("op"),
        type: "tip",
        state: "awaiting_payment",
        initiatorId: page.data.initiatorId,
        participantIds: supporter === "user_guest" ? [page.data.initiatorId] : [page.data.initiatorId, supporter],
        label: tip.data.title,
        parentId: page.id,
        payment: null,
        access: null,
        disclosures: page.data.disclosures,
      });
      const request = await createPaymentRequest(tx, { operationId: child.id, purpose: "tip", payeeId: tip.data.creatorId, amountZatoshi: amount, label: tip.data.title });
      await tx.put("tip_note", child.id, { memo: input.memo ?? null, includeMemo: Boolean(input.includeMemo && input.memo) }, null);
      return { version: child.version, operation: child.data, receipt: null, payment: null, request: publicRequest(request) };
    }
    const payment = await settleSimulated(tx, payer, {
      idempotencyKey: idempotencyKey || `tip-sim:${id}:${amount.toString()}`,
      amountZatoshi: amount.toString(),
      feeZatoshi: "0",
    });
    if (!paymentSatisfies(payment, cfg.allowSimulated)) {
      throw new AshError("payment_unverified", "The simulated payment was not accepted.", 402);
    }
    const supporterId = actor?.user.id ?? "user_guest";
    const created = await createOperation(tx, {
      id: newId("op"),
      type: "tip",
      state: "awaiting_payment",
      initiatorId: page.data.initiatorId,
      participantIds: supporterId === "user_guest" ? [page.data.initiatorId] : [page.data.initiatorId, supporterId],
      label: tip.data.title,
      parentId: page.id,
      payment: null,
      access: null,
      disclosures: page.data.disclosures,
    });
    const nextState = paymentSatisfies(payment, cfg.allowSimulated) ? "payment_verified" : "payment_observed";
    const moved = await saveOperation(tx, created, { ...created.data, state: nextState, payment }, "payment_recorded", payment.mode, payment.txId);
    if (nextState !== "payment_verified") {
      return { version: moved.version, operation: moved.data, receipt: null, payment, request: null };
    }
    const body = receiptFor(payment, tip.data, input.memo ?? null, Boolean(input.includeMemo && input.memo));
    const signed = signDocument(cfg.receiptSecret, body);
    const receipt: SignedReceipt = { ...body, publicKey: signed.publicKey, signature: signed.signature };
    await tx.put("receipt", receipt.id, receipt, null);
    const completed = await saveOperation(tx, moved, { ...moved.data, state: "completed" }, "receipt_issued", null, receipt.id);
    return { version: completed.version, operation: completed.data, receipt, payment, request: null };
  });
}

// A real tip payment: seen moves the record to "seen"; confirmed issues the signed receipt.
onPayment("tip", async (tx, request: PaymentRequest, payment) => {
  const op = await mustGet<OperationRecord>(tx, "operation", request.operationId);
  if (op.data.state === "completed") return;
  if (payment.status !== "confirmed") {
    if (op.data.state === "awaiting_payment") {
      await saveOperation(tx, op, { ...op.data, state: "payment_observed", payment }, "payment_recorded", payment.mode, payment.txId);
    }
    return;
  }
  const page = await mustGet<TipData>(tx, "tip", op.data.parentId ?? "");
  const note = (await tx.get<{ memo: string | null; includeMemo: boolean }>("tip_note", op.id))?.data ?? { memo: null, includeMemo: false };
  const verified = await saveOperation(tx, op, { ...op.data, state: "payment_verified", payment }, "payment_recorded", payment.mode, payment.txId);
  const body = receiptFor(payment, page.data, note.memo, note.includeMemo);
  const signed = signDocument(config(request.mode).receiptSecret, body);
  const receipt: SignedReceipt = { ...body, publicKey: signed.publicKey, signature: signed.signature };
  await tx.put("receipt", receipt.id, receipt, null);
  await saveOperation(tx, verified, { ...verified.data, state: "completed" }, "receipt_issued", null, receipt.id);
  return receipt.id;
});

export async function getReceipt(tx: Tx, id: string): Promise<SignedReceipt> {
  const doc = await mustGet<SignedReceipt>(tx, "receipt", id);
  const { publicKey, signature, ...body } = doc.data;
  if (!verifyDocument(publicKey, signature, body)) throw new AshError("invalid_receipt", "Receipt signature is not valid.", 409);
  return doc.data;
}

export function checkReceipt(receipt: SignedReceipt): { valid: boolean; reason: string } {
  const { publicKey, signature, ...body } = receipt;
  const keys = Object.keys(body);
  if (keys.some((key) => key.toLowerCase().includes("viewing"))) return { valid: false, reason: "Receipt contains viewing material." };
  if (!verifyDocument(publicKey, signature, body)) return { valid: false, reason: "Receipt signature does not match." };
  return { valid: true, reason: body.verificationStatement };
}

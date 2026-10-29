import { AshError } from "@/domain/errors";
import { newId } from "@/domain/ids";
import { zecToZatoshi } from "@/domain/money";
import { paymentSatisfies } from "@/domain/payment";
import { DISCLOSURES, type Mode, type OperationRecord, type OperationState, type PaymentRecord } from "@/domain/types";
import { config } from "@/server/config";
import { assertShieldedDestination } from "@/zcash/address";
import { buildZip321 } from "@/zcash/zip321";
import type { Tx } from "@/store/types";
import { assertPerson, assertRole, assertScope, idempotent, mustGet, requestHash, settleSimulated, type Actor } from "./common";
import { createOperation, saveOperation } from "./events";
import { createPaymentRequest, onPayment, publicRequest, requestForOperation } from "./payment-requests";
import { payoutAddress } from "./wallet-keys";
import { currentMode, recordMode, withMode } from "@/server/mode";

export type SubscriptionOffer = {
  providerId: string;
  providerName: string;
  title: string;
  description: string;
  priceZatoshi: string;
  intervalDays: number;
  graceDays: number;
  payTo?: string | null;
  network?: "mainnet" | "testnet";
  mode?: Mode;
};

export type SubscriptionData = {
  offerId: string;
  providerId: string;
  customerId: string;
  title: string;
  priceZatoshi: string;
  intervalDays: number;
  graceDays: number;
  currentPeriodEnd: string | null;
  appliedPaymentIds: string[];
};

const DAY = 24 * 60 * 60 * 1000;

export function effectiveSubscription(data: SubscriptionData, state: OperationState, now = Date.now()): {
  state: OperationState;
  entitled: boolean;
  restricted: boolean;
  warning: boolean;
} {
  if (state === "cancelled") return { state, entitled: false, restricted: true, warning: false };
  if (!data.currentPeriodEnd) return { state, entitled: false, restricted: true, warning: false };
  const end = Date.parse(data.currentPeriodEnd);
  const graceEnd = end + data.graceDays * DAY;
  if (now <= end) return { state: state === "grace" || state === "expired" ? "completed" : state, entitled: true, restricted: false, warning: false };
  if (now <= graceEnd) return { state: "grace", entitled: true, restricted: false, warning: true };
  return { state: "expired", entitled: false, restricted: true, warning: false };
}

export async function createSubscriptionOffer(
  tx: Tx,
  actor: Actor,
  input: { title: string; description: string; priceZec: string; intervalDays: number; graceDays: number; payTo?: string },
) {
  assertPerson(actor);
  assertRole(actor, ["creator", "operator"]);
  if (input.intervalDays < 1 || input.graceDays < 0) throw new AshError("validation_failed", "Interval and grace must be non-negative.");
  const cfg = config();
  // Real modes pay the provider's verified receiving address.
  const verified = cfg.allowSimulated ? null : await payoutAddress(tx, actor.user.id, cfg.network);
  if (!cfg.allowSimulated && !verified) {
    throw new AshError("payee_key_missing", `Add your ${cfg.network} receiving address and viewing key in Settings first, so ASH can verify renewals to you.`, 409);
  }
  const payToInput = verified ?? (input.payTo?.trim() || "");
  const price = zecToZatoshi(input.priceZec);
  if (price <= 0n) throw new AshError("invalid_amount", "Price must be greater than zero.");
  const offer: SubscriptionOffer = {
    providerId: actor.user.id,
    providerName: actor.user.name,
    title: input.title.trim(),
    description: input.description.trim(),
    priceZatoshi: price.toString(),
    intervalDays: input.intervalDays,
    graceDays: input.graceDays,
    payTo: payToInput ? assertShieldedDestination(payToInput, cfg.network).address : null,
    network: cfg.network,
    mode: cfg.mode,
  };
  const id = newId("plan");
  await tx.put("plan", id, offer, null);
  return { id, offer };
}

export async function listPlans(tx: Tx) {
  const mode = currentMode();
  const plans = (await tx.list<SubscriptionOffer>("plan")).filter((plan) => recordMode(plan.data) === mode);
  return plans.map((plan) => ({
    id: plan.id,
    ...plan.data,
    payTo: plan.data.payTo ?? null,
    walletUri: plan.data.payTo
      ? buildZip321([{ address: plan.data.payTo, amountZatoshi: BigInt(plan.data.priceZatoshi), label: plan.data.title }], plan.data.network)
      : null,
  }));
}

export async function subscribe(tx: Tx, actor: Actor, offerId: string, idempotencyKey: string | null) {
  assertScope(actor, "pay");
  assertRole(actor, ["buyer", "creator", "operator"]);
  return idempotent(tx, `sub:${actor.user.id}`, idempotencyKey, requestHash({ offerId }), async () => {
    const offer = await mustGet<SubscriptionOffer>(tx, "plan", offerId);
    const id = newId("op");
    const data: SubscriptionData = {
      offerId,
      providerId: offer.data.providerId,
      customerId: actor.user.id,
      title: offer.data.title,
      priceZatoshi: offer.data.priceZatoshi,
      intervalDays: offer.data.intervalDays,
      graceDays: offer.data.graceDays,
      currentPeriodEnd: null,
      appliedPaymentIds: [],
    };
    const created = await createOperation(tx, {
      id,
      type: "subscription",
      state: "awaiting_payment",
      initiatorId: actor.user.id,
      participantIds: [actor.user.id, offer.data.providerId],
      label: offer.data.title,
      parentId: null,
      payment: null,
      access: { kind: "subscription", entitled: false, restricted: true, note: "No verified renewal yet." },
      disclosures: [DISCLOSURES.metadata, "Renewal is a new wallet payment. ASH does not debit a shielded account automatically."],
    });
    await tx.put("subscription", id, data, null);
    return { version: created.version, operation: created.data, subscription: data, effective: effectiveSubscription(data, created.data.state) };
  });
}

async function persistEffective(tx: Tx, operation: { id: string; version: number; data: OperationRecord }, data: SubscriptionData, now: number) {
  const next = effectiveSubscription(data, operation.data.state, now);
  if (next.state === operation.data.state) {
    return { version: operation.version, operation: operation.data, subscription: data, effective: next };
  }
  const saved = await saveOperation(
    tx,
    operation,
    {
      ...operation.data,
      state: next.state,
      access: {
        kind: "subscription",
        entitled: next.entitled,
        restricted: next.restricted,
        note: next.warning ? "Grace period. Access continues until the grace date, then it is restricted." : "Access follows the verified renewal clock.",
      },
    },
    "clock",
    next.state,
  );
  return { version: saved.version, operation: saved.data, subscription: data, effective: next };
}

/** Extends the period for one accepted payment. Idempotent per payment key. */
async function applyRenewal(
  tx: Tx,
  operation: { id: string; version: number; data: OperationRecord },
  doc: { id: string; version: number; data: SubscriptionData },
  payment: PaymentRecord,
  now: number,
) {
  if (doc.data.appliedPaymentIds.includes(payment.idempotencyKey)) {
    return persistEffective(tx, operation, doc.data, now);
  }
  const base = Math.max(now, doc.data.currentPeriodEnd ? Date.parse(doc.data.currentPeriodEnd) : now);
  const nextData: SubscriptionData = {
    ...doc.data,
    currentPeriodEnd: new Date(base + doc.data.intervalDays * DAY).toISOString(),
    appliedPaymentIds: [...doc.data.appliedPaymentIds, payment.idempotencyKey],
  };
  await tx.put("subscription", doc.id, nextData, doc.version);
  const stepped =
    operation.data.state === "awaiting_payment" || operation.data.state === "payment_observed"
      ? await saveOperation(tx, operation, { ...operation.data, state: "payment_verified", payment }, "payment_recorded", payment.mode, payment.txId)
      : operation;
  const active =
    stepped.data.state === "completed"
      ? await saveOperation(
          tx,
          stepped,
          { ...stepped.data, payment, access: { kind: "subscription", entitled: true, restricted: false, note: "Renewed by a verified payment." } },
          "renewed",
          null,
          payment.txId,
        )
      : await saveOperation(
          tx,
          stepped,
          { ...stepped.data, state: "completed", payment, access: { kind: "subscription", entitled: true, restricted: false, note: "Renewed by a verified payment." } },
          "renewed",
          null,
          payment.txId,
        );
  return { version: active.version, operation: active.data, subscription: nextData, effective: effectiveSubscription(nextData, "completed", now) };
}

export async function renewSubscription(
  tx: Tx,
  actor: Actor,
  id: string,
  expectedVersion: number,
  idempotencyKey: string | null,
  now = Date.now(),
) {
  assertScope(actor, "pay");
  const record = await mustGet<OperationRecord>(tx, "operation", id);
  return withMode(recordMode(record.data), () =>
    idempotent(tx, `renew:${id}`, idempotencyKey, requestHash({ id, expectedVersion }), async () => {
      const operation = await mustGet<OperationRecord>(tx, "operation", id);
      if (operation.version !== expectedVersion) throw new AshError("conflict", "This subscription changed. Reload it.", 409);
      const doc = await mustGet<SubscriptionData>(tx, "subscription", id);
      if (actor.user.id !== doc.data.customerId) throw new AshError("forbidden", "Only the customer can renew.", 403);
      if (operation.data.state === "cancelled") throw new AshError("invalid_state", "A cancelled subscription does not renew.", 409);
      const cfg = config();
      if (!cfg.allowSimulated) {
        // Real payment: one request per period. The period moves only when it is confirmed.
        const existing = await requestForOperation(tx, id);
        const request =
          existing && existing.status !== "confirmed"
            ? existing
            : await createPaymentRequest(tx, { operationId: id, purpose: "renewal", payeeId: doc.data.providerId, amountZatoshi: BigInt(doc.data.priceZatoshi), label: doc.data.title });
        return { version: operation.version, operation: operation.data, subscription: doc.data, effective: effectiveSubscription(doc.data, operation.data.state, now), request: publicRequest(request) };
      }
      const payment = await settleSimulated(tx, actor, {
        idempotencyKey: idempotencyKey || `renew:${id}:${now}`,
        amountZatoshi: doc.data.priceZatoshi,
        feeZatoshi: "0",
      });
      if (!paymentSatisfies(payment, cfg.allowSimulated)) {
        throw new AshError("payment_unverified", payment.reason || "The renewal payment was not accepted.", 402);
      }
      return { ...(await applyRenewal(tx, operation, doc, payment, now)), request: null };
    }),
  );
}

// A real renewal payment: seen shows on the record; confirmed extends the period.
onPayment("renewal", async (tx, request, payment) => {
  const operation = await mustGet<OperationRecord>(tx, "operation", request.operationId);
  if (operation.data.state === "cancelled") return;
  const doc = await mustGet<SubscriptionData>(tx, "subscription", request.operationId);
  if (payment.status !== "confirmed") {
    if (operation.data.state === "awaiting_payment") {
      await saveOperation(tx, operation, { ...operation.data, state: "payment_observed", payment }, "payment_recorded", payment.mode, payment.txId);
    }
    return;
  }
  await applyRenewal(tx, operation, doc, payment, Date.now());
});

export async function refreshSubscription(tx: Tx, actor: Actor, id: string, now = Date.now()) {
  const operation = await mustGet<OperationRecord>(tx, "operation", id);
  const doc = await mustGet<SubscriptionData>(tx, "subscription", id);
  if (actor.user.id !== doc.data.customerId && actor.user.id !== doc.data.providerId) {
    throw new AshError("forbidden", "You cannot view this subscription.", 403);
  }
  return persistEffective(tx, operation, doc.data, now);
}

export async function cancelSubscription(tx: Tx, actor: Actor, id: string, expectedVersion: number) {
  assertPerson(actor);
  const operation = await mustGet<OperationRecord>(tx, "operation", id);
  if (operation.version !== expectedVersion) throw new AshError("conflict", "This subscription changed. Reload it.", 409);
  const doc = await mustGet<SubscriptionData>(tx, "subscription", id);
  if (actor.user.id !== doc.data.customerId) throw new AshError("forbidden", "Only the customer can cancel.", 403);
  const saved = await saveOperation(
    tx,
    operation,
    {
      ...operation.data,
      state: "cancelled",
      access: { kind: "subscription", entitled: false, restricted: true, note: "Cancelled. The record is kept and will not renew." },
    },
    "cancelled",
    "customer cancelled",
  );
  return { version: saved.version, operation: saved.data, subscription: doc.data, effective: effectiveSubscription(doc.data, "cancelled") };
}

export async function listSubscriptions(tx: Tx, actor: Actor) {
  const mode = currentMode();
  const rows = await tx.list<SubscriptionData>("subscription");
  const ops = new Map((await tx.list<OperationRecord>("operation")).filter((op) => op.data.type === "subscription").map((op) => [op.id, op.data]));
  return rows
    .filter((row) => row.data.customerId === actor.user.id || row.data.providerId === actor.user.id)
    .filter((row) => {
      const op = ops.get(row.id);
      return op ? recordMode(op) === mode : mode === "practice";
    })
    .map((row) => ({
      id: row.id,
      offerId: row.data.offerId,
      title: row.data.title,
      priceZatoshi: row.data.priceZatoshi,
      currentPeriodEnd: row.data.currentPeriodEnd,
      customerId: row.data.customerId === actor.user.id ? "you" : "customer",
    }));
}

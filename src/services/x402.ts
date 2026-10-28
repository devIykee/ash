import { AshError } from "@/domain/errors";
import { newId, nowIso } from "@/domain/ids";
import { paymentSatisfies } from "@/domain/payment";
import { DISCLOSURES, type OperationRecord } from "@/domain/types";
import { config, payToStatus } from "@/server/config";
import type { Tx } from "@/store/types";
import { assertScope, mustGet, settleObserved, settleSimulated, type Actor } from "./common";
import { createOperation, saveOperation } from "./events";

export type ChallengeData = {
  id: string;
  operationId: string;
  resource: string;
  method: string;
  amountZatoshi: string;
  payTo: string;
  network: "mainnet" | "testnet";
  expiresAt: string;
  nonce: string;
  status: "open" | "fulfilled" | "expired";
  paymentRef: string | null;
};

const RESOURCE = "/api/v1/paid/research";
const PRICE = "100000";

export function paymentRequiredDocument(challenge: ChallengeData, origin: string) {
  return {
    x402Version: 2,
    error: "Payment required",
    resource: {
      url: `${origin}${challenge.resource}`,
      description: "One shielded request for a short ASH research note.",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "zcash-shielded",
        network: `zcash:${challenge.network}`,
        amount: challenge.amountZatoshi,
        asset: "ZEC",
        payTo: challenge.payTo,
        maxTimeoutSeconds: 300,
        extra: {
          ashExtension: true,
          officialX402Scheme: false,
          challengeId: challenge.id,
          expiresAt: challenge.expiresAt,
          amountIsZatoshi: true,
          confirmationPolicy: DISCLOSURES.observed,
        },
      },
    ],
  };
}

export async function issueChallenge(tx: Tx, origin: string): Promise<{ status: number; body: ReturnType<typeof paymentRequiredDocument>; headers: Record<string, string> }> {
  const cfg = config();
  const payTo = payToStatus(cfg);
  if (!payTo.ok) throw new AshError("not_configured", payTo.reason, 503);
  const id = newId("chal");
  const operationId = newId("op");
  const challenge: ChallengeData = {
    id,
    operationId,
    resource: RESOURCE,
    method: "GET",
    amountZatoshi: PRICE,
    payTo: cfg.payTo,
    network: cfg.network,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    nonce: newId("nonce"),
    status: "open",
    paymentRef: null,
  };
  await createOperation(tx, {
    id: operationId,
    type: "api_request",
    state: "awaiting_payment",
    initiatorId: "user_avery",
    participantIds: [],
    label: "Paid research note",
    parentId: null,
    payment: null,
    access: { kind: "api", entitled: false, restricted: true, note: "Payment challenge only. The API has not run." },
    disclosures: [DISCLOSURES.observed, "This HTTP 402 is a challenge, not a confirmation that anyone paid."],
  });
  await tx.put("challenge", id, challenge, null);
  const body = paymentRequiredDocument(challenge, origin);
  return {
    status: 402,
    body,
    headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(body)), "cache-control": "no-store" },
  };
}

export async function payChallenge(tx: Tx, actor: Actor, id: string, input: { txId?: string } = {}) {
  assertScope(actor, "pay");
  const doc = await mustGet<ChallengeData>(tx, "challenge", id);
  if (doc.data.status !== "open") throw new AshError("invalid_state", "This challenge is no longer payable.", 409);
  if (Date.parse(doc.data.expiresAt) <= Date.now()) {
    await tx.put("challenge", id, { ...doc.data, status: "expired" }, doc.version);
    throw new AshError("challenge_expired", "This payment challenge has expired. Request the resource again.", 410);
  }
  const cfg = config();
  if (!cfg.allowSimulated && !input.txId) {
    throw new AshError("txid_required", "Pay the address in the challenge from a wallet, then send the transaction id.", 400);
  }
  const payment = input.txId
    ? await settleObserved(tx, {
        idempotencyKey: `challenge:${id}`,
        txId: input.txId,
        amountZatoshi: doc.data.amountZatoshi,
        feeZatoshi: "0",
      })
    : await settleSimulated(tx, actor, {
        idempotencyKey: `challenge:${id}`,
        amountZatoshi: doc.data.amountZatoshi,
        feeZatoshi: "0",
      });
  const satisfied = paymentSatisfies(payment, cfg.allowSimulated);
  if (!satisfied && payment.status !== "observed") {
    throw new AshError("payment_unverified", payment.reason || "The payment is not sufficient to retry the request.", 402);
  }
  const operation = await mustGet<OperationRecord>(tx, "operation", doc.data.operationId);
  if (!operation.data.participantIds.includes(actor.user.id)) {
    operation.data.participantIds = [...operation.data.participantIds, actor.user.id];
  }
  await saveOperation(
    tx,
    operation,
    {
      ...operation.data,
      state: satisfied ? "payment_verified" : "payment_observed",
      payment,
      access: {
        kind: "api",
        entitled: false,
        restricted: true,
        note: satisfied ? "Paid. The resource runs only on the retry." : payment.reason || DISCLOSURES.observed,
      },
    },
    "payment_recorded",
    payment.mode,
    payment.txId,
  );
  if (!satisfied) {
    // Observation alone never unlocks the resource, so no payment reference is issued.
    return { paymentRef: null, status: payment.status, reason: payment.reason, challengeId: id, resource: doc.data.resource };
  }
  const fresh = await mustGet<ChallengeData>(tx, "challenge", id);
  await tx.put("challenge", id, { ...fresh.data, paymentRef: payment.idempotencyKey }, fresh.version);
  return { paymentRef: payment.idempotencyKey, status: payment.status, reason: null, challengeId: id, resource: doc.data.resource };
}

export async function fulfillChallenge(tx: Tx, header: string | null, requestPath: string) {
  if (!header) return null;
  let payload: { scheme?: string; payload?: { challengeId?: string; paymentRef?: string } };
  try {
    payload = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as typeof payload;
  } catch {
    throw new AshError("payment_unverified", "PAYMENT-SIGNATURE is not valid base64 JSON.", 402);
  }
  if (payload.scheme !== "zcash-shielded" || !payload.payload?.challengeId || !payload.payload.paymentRef) {
    throw new AshError("payment_unverified", "ASH only accepts its zcash-shielded payment reference.", 402);
  }
  const doc = await mustGet<ChallengeData>(tx, "challenge", payload.payload.challengeId);
  if (doc.data.resource !== requestPath) {
    throw new AshError("payment_unverified", "This payment reference is bound to a different request.", 402);
  }
  if (doc.data.status === "fulfilled") throw new AshError("duplicate_fulfillment", "This payment reference was already used.", 409);
  if (doc.data.status === "expired" || Date.parse(doc.data.expiresAt) <= Date.now()) {
    throw new AshError("challenge_expired", "This payment challenge has expired.", 410);
  }
  if (doc.data.paymentRef !== payload.payload.paymentRef) {
    throw new AshError("payment_unverified", "The payment reference does not match this challenge.", 402);
  }
  const operation = await mustGet<OperationRecord>(tx, "operation", doc.data.operationId);
  const cfg = config();
  if (!operation.data.payment || !paymentSatisfies(operation.data.payment, cfg.allowSimulated)) {
    throw new AshError("payment_unverified", "ASH has no verified payment for this challenge.", 402);
  }
  await tx.put("challenge", doc.id, { ...doc.data, status: "fulfilled" }, doc.version);
  await saveOperation(
    tx,
    operation,
    {
      ...operation.data,
      state: "completed",
      access: { kind: "api", entitled: true, restricted: false, note: "The paid request ran once." },
    },
    "fulfilled",
    "single use",
    doc.id,
  );
  return {
    topic: "Shielded request pricing",
    text: "A 402 challenge is not a payment. ASH runs this note only after a payment reference for this exact path is verified and unused.",
    servedAt: nowIso(),
  };
}

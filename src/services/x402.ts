import { AshError } from "@/domain/errors";
import { newId, nowIso } from "@/domain/ids";
import { paymentSatisfies } from "@/domain/payment";
import { DISCLOSURES, type OperationRecord } from "@/domain/types";
import { config } from "@/server/config";
import { recordMode, withMode } from "@/server/mode";
import type { Tx } from "@/store/types";
import { assertScope, mustGet, settleSimulated, type Actor } from "./common";
import { createOperation, saveOperation } from "./events";
import { checkPaymentRequest, createPaymentRequest, onPayment, publicRequest, type PublicRequest } from "./payment-requests";

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
  /** Real modes: the payment request whose memo reference the payer must include. */
  requestRef?: string | null;
  memo?: string | null;
  uri?: string | null;
  requiredConfirmations?: number;
};

/** The paid API's revenue goes to the operator persona's verified receiving address. */
const API_OWNER = "user_avery";

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
        maxTimeoutSeconds: Math.max(60, Math.round((Date.parse(challenge.expiresAt) - Date.now()) / 1000)),
        extra: {
          ashExtension: true,
          officialX402Scheme: false,
          challengeId: challenge.id,
          expiresAt: challenge.expiresAt,
          amountIsZatoshi: true,
          practice: !challenge.requestRef,
          memo: challenge.memo ?? null,
          paymentUri: challenge.uri ?? null,
          paymentRequestRef: challenge.requestRef ?? null,
          requiredConfirmations: challenge.requiredConfirmations ?? null,
          confirmationPolicy: challenge.requestRef
            ? "Pay payTo with the memo exactly as given. ASH verifies the note with the payee's viewing key and serves the resource once it has the required confirmations."
            : DISCLOSURES.simulated,
        },
      },
    ],
  };
}

export async function issueChallenge(tx: Tx, origin: string): Promise<{ status: number; body: ReturnType<typeof paymentRequiredDocument>; headers: Record<string, string> }> {
  const cfg = config();
  const id = newId("chal");
  const operationId = newId("op");
  await createOperation(tx, {
    id: operationId,
    type: "api_request",
    state: "awaiting_payment",
    initiatorId: API_OWNER,
    participantIds: [],
    label: "Paid research note",
    parentId: null,
    payment: null,
    access: { kind: "api", entitled: false, restricted: true, note: "Payment challenge only. The API has not run." },
    disclosures: [cfg.allowSimulated ? DISCLOSURES.simulated : "A real payment is verified on chain before the resource runs.", "This HTTP 402 is a challenge, not a confirmation that anyone paid."],
  });
  let request: PublicRequest | null = null;
  if (!cfg.allowSimulated) {
    try {
      request = publicRequest(await createPaymentRequest(tx, { operationId, purpose: "api", payeeId: API_OWNER, amountZatoshi: BigInt(PRICE), label: "ASH research note" }));
    } catch (error) {
      if (error instanceof AshError && error.code === "payee_key_missing") {
        throw new AshError("not_configured", `The API owner has not added a ${cfg.network} receiving key in Settings yet, so this resource cannot take a ${cfg.network} payment.`, 503);
      }
      throw error;
    }
  }
  const challenge: ChallengeData = {
    id,
    operationId,
    resource: RESOURCE,
    method: "GET",
    amountZatoshi: PRICE,
    payTo: request ? request.address : cfg.payTo,
    network: cfg.network,
    // A real payment needs blocks; practice payments are instant.
    expiresAt: new Date(Date.now() + (request ? 60 : 5) * 60 * 1000).toISOString(),
    nonce: newId("nonce"),
    status: "open",
    paymentRef: null,
    requestRef: request?.ref ?? null,
    memo: request?.memo ?? null,
    uri: request?.uri ?? null,
    requiredConfirmations: request?.requiredConfirmations,
  };
  await tx.put("challenge", id, challenge, null);
  if (challenge.requestRef) await tx.put("request_challenge", challenge.requestRef, { challengeId: id }, null);
  const body = paymentRequiredDocument(challenge, origin);
  return {
    status: 402,
    body,
    headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(body)), "cache-control": "no-store" },
  };
}

/** Practice mode: records a practice payment and returns a one-time payment reference. */
export async function payChallenge(tx: Tx, actor: Actor, id: string) {
  assertScope(actor, "pay");
  const doc = await mustGet<ChallengeData>(tx, "challenge", id);
  if (doc.data.requestRef) throw new AshError("invalid_state", "This challenge takes a real payment. Pay it from a wallet, then check it.", 409);
  const operationRecord = await mustGet<OperationRecord>(tx, "operation", doc.data.operationId);
  return withMode(recordMode(operationRecord.data), async () => {
    if (doc.data.status !== "open") throw new AshError("invalid_state", "This challenge is no longer payable.", 409);
    if (Date.parse(doc.data.expiresAt) <= Date.now()) {
      await tx.put("challenge", id, { ...doc.data, status: "expired" }, doc.version);
      throw new AshError("challenge_expired", "This payment challenge has expired. Request the resource again.", 410);
    }
    const payment = await settleSimulated(tx, actor, {
      idempotencyKey: `challenge:${id}`,
      amountZatoshi: doc.data.amountZatoshi,
      feeZatoshi: "0",
    });
    if (!paymentSatisfies(payment)) throw new AshError("payment_unverified", "The payment is not sufficient to retry the request.", 402);
    const operation = await mustGet<OperationRecord>(tx, "operation", doc.data.operationId);
    if (!operation.data.participantIds.includes(actor.user.id)) {
      operation.data.participantIds = [...operation.data.participantIds, actor.user.id];
    }
    await saveOperation(
      tx,
      operation,
      { ...operation.data, state: "payment_verified", payment, access: { kind: "api", entitled: false, restricted: true, note: "Paid. The resource runs only on the retry." } },
      "payment_recorded",
      payment.mode,
      payment.txId,
    );
    const fresh = await mustGet<ChallengeData>(tx, "challenge", id);
    await tx.put("challenge", id, { ...fresh.data, paymentRef: payment.idempotencyKey }, fresh.version);
    return { paymentRef: payment.idempotencyKey, status: payment.status, reason: null, challengeId: id, resource: doc.data.resource, request: null };
  });
}

/**
 * Real modes: looks for the payment on chain (optionally by transaction id). Returns a payment
 * reference only once the payment is confirmed. Runs outside a database transaction.
 */
export async function checkChallengePayment(read: (fn: (tx: Tx) => Promise<ChallengeData>) => Promise<ChallengeData>, id: string, txId?: string) {
  const challenge = await read((tx) => mustGet<ChallengeData>(tx, "challenge", id).then((doc) => doc.data));
  if (!challenge.requestRef) throw new AshError("invalid_state", "This is a practice challenge. Record a practice payment instead.", 409);
  if (challenge.status === "fulfilled") throw new AshError("duplicate_fulfillment", "This payment was already used.", 409);
  const request = await checkPaymentRequest(challenge.requestRef, txId);
  const confirmed = request.status === "confirmed";
  return {
    paymentRef: confirmed ? challenge.requestRef : null,
    status: confirmed ? "confirmed" : request.match ? "observed" : "waiting",
    reason: request.lastReason,
    challengeId: id,
    resource: challenge.resource,
    request,
  };
}

// A real API payment: confirmed sets the one-time payment reference on the challenge.
onPayment("api", async (tx, request, payment) => {
  const operation = await mustGet<OperationRecord>(tx, "operation", request.operationId);
  const pointer = await tx.get<{ challengeId: string }>("request_challenge", request.ref);
  const challenge = pointer ? await tx.get<ChallengeData>("challenge", pointer.data.challengeId) : null;
  if (!challenge || challenge.data.status !== "open") return;
  const confirmed = payment.status === "confirmed";
  if (operation.data.state === "awaiting_payment" || operation.data.state === "payment_observed") {
    const state = confirmed ? "payment_verified" : "payment_observed";
    if (state !== operation.data.state || confirmed) {
      await saveOperation(
        tx,
        operation,
        { ...operation.data, state, payment, access: { kind: "api", entitled: false, restricted: true, note: confirmed ? "Paid. The resource runs on the retry." : "Payment seen. Waiting for confirmations." } },
        "payment_recorded",
        payment.mode,
        payment.txId,
      );
    }
  }
  if (confirmed) await tx.put("challenge", challenge.id, { ...challenge.data, paymentRef: request.ref }, challenge.version);
});

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
  if (!operation.data.payment || !paymentSatisfies(operation.data.payment)) {
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

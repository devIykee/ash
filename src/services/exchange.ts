import { AshError } from "@/domain/errors";
import { newId } from "@/domain/ids";
import { zecToZatoshi } from "@/domain/money";
import { paymentSatisfies } from "@/domain/payment";
import { DISCLOSURES, type OperationRecord } from "@/domain/types";
import { assertSealedBox, type SealedBox } from "@/crypto/box";
import { assertPack, ciphertextSha256, type AshPack } from "@/crypto/pack";
import { shareFromJson } from "@/crypto/shamir";
import { config } from "@/server/config";
import type { Tx } from "@/store/types";
import {
  assertParticipant,
  assertPerson,
  assertRole,
  assertScope,
  idempotent,
  mustGet,
  requestHash,
  settleObserved,
  settleSimulated,
  type Actor,
} from "./common";
import { createOperation, saveOperation } from "./events";

export type OfferData = {
  sellerId: string;
  sellerName: string;
  title: string;
  description: string;
  priceZatoshi: string;
  network: "mainnet" | "testnet";
  plaintextSha256: string;
  ciphertextSha256: string;
  byteLength: number;
  pack: AshPack;
  status: "open" | "closed";
  createdAt: string;
};

export type ExchangeData = {
  offerId: string;
  sellerId: string;
  buyerId: string;
  operationId: string;
  buyerPublicKey: string;
  buyerShareEnvelope: SealedBox | null;
  releaseEnvelope: SealedBox | null;
  mediatorShare: { index: number; bytes: string } | null;
  priceZatoshi: string;
};

export type PublicOffer = {
  id: string;
  sellerName: string;
  title: string;
  description: string;
  priceZatoshi: string;
  network: "mainnet" | "testnet";
  plaintextSha256: string;
  ciphertextSha256: string;
  byteLength: number;
  protocol: "shamir-2-of-3-mediator";
  disclosures: string[];
};

function publish(id: string, offer: OfferData): PublicOffer {
  return {
    id,
    sellerName: offer.sellerName,
    title: offer.title,
    description: offer.description,
    priceZatoshi: offer.priceZatoshi,
    network: offer.network,
    plaintextSha256: offer.plaintextSha256,
    ciphertextSha256: offer.ciphertextSha256,
    byteLength: offer.byteLength,
    protocol: "shamir-2-of-3-mediator",
    disclosures: [DISCLOSURES.escrow, DISCLOSURES.metadata, DISCLOSURES.orchard],
  };
}

export async function createOffer(
  tx: Tx,
  actor: Actor,
  input: {
    title: string;
    description: string;
    priceZec: string;
    plaintextSha256: string;
    pack: AshPack;
  },
  idempotencyKey: string | null,
) {
  assertPerson(actor);
  assertRole(actor, ["creator", "operator"]);
  return idempotent(tx, `offer:${actor.user.id}`, idempotencyKey, requestHash({ ...input, pack: input.pack.plaintextSha256 }), async () => {
    assertPack(input.pack);
    if (input.pack.plaintextSha256 !== input.plaintextSha256) {
      throw new AshError("invalid_payload", "The claimed plaintext hash does not match the package.");
    }
    const price = zecToZatoshi(input.priceZec);
    if (price <= 0n) throw new AshError("invalid_amount", "Price must be greater than zero.");
    const id = newId("offer");
    const offer: OfferData = {
      sellerId: actor.user.id,
      sellerName: actor.user.name,
      title: input.title.trim(),
      description: input.description.trim(),
      priceZatoshi: price.toString(),
      network: config().network,
      plaintextSha256: input.plaintextSha256,
      ciphertextSha256: ciphertextSha256(input.pack),
      byteLength: input.pack.chunks.reduce((sum, chunk) => sum + chunk.ciphertext.length / 2, 0),
      pack: input.pack,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    await tx.put("offer", id, offer, null);
    return { offer: publish(id, offer) };
  });
}

export async function listOffers(tx: Tx): Promise<PublicOffer[]> {
  const offers = await tx.list<OfferData>("offer");
  return offers.filter((offer) => offer.data.status === "open").map((offer) => publish(offer.id, offer.data));
}

export async function getOffer(tx: Tx, id: string, actor: Actor | null) {
  const offer = await mustGet<OfferData>(tx, "offer", id);
  const pub = publish(id, offer.data);
  if (actor?.user.id === offer.data.sellerId) return { ...pub, pack: offer.data.pack };
  return pub;
}

export async function registerKey(tx: Tx, actor: Actor, publicKey: string) {
  if (!/^[0-9a-f]{64}$/.test(publicKey)) throw new AshError("invalid_key", "Public key must be 32 bytes of hex.");
  const existing = await tx.get<{ publicKey: string }>("device_key", actor.user.id);
  if (existing) {
    await tx.put("device_key", actor.user.id, { publicKey }, existing.version);
  } else {
    await tx.put("device_key", actor.user.id, { publicKey }, null);
  }
  return { publicKey };
}

export async function openExchange(tx: Tx, actor: Actor, offerId: string, idempotencyKey: string | null) {
  assertScope(actor, "exchange");
  assertRole(actor, ["buyer", "creator", "operator"]);
  return idempotent(tx, `exchange:${actor.user.id}`, idempotencyKey, requestHash({ offerId }), async () => {
    const offer = await mustGet<OfferData>(tx, "offer", offerId);
    if (offer.data.sellerId === actor.user.id) throw new AshError("invalid_state", "You cannot buy your own offer.", 409);
    const key = await tx.get<{ publicKey: string }>("device_key", actor.user.id);
    if (!key) throw new AshError("invalid_key", "Register an encryption key from this browser before buying.", 409);
    const id = newId("op");
    const created = await createOperation(tx, {
      id,
      type: "data_exchange",
      state: "awaiting_seller",
      initiatorId: offer.data.sellerId,
      participantIds: [offer.data.sellerId, actor.user.id],
      label: offer.data.title,
      parentId: null,
      payment: null,
      access: { kind: "delivery", entitled: false, restricted: true, note: "The seller has not authorized delivery." },
      disclosures: [DISCLOSURES.escrow, DISCLOSURES.metadata],
    });
    const exchange: ExchangeData = {
      offerId,
      sellerId: offer.data.sellerId,
      buyerId: actor.user.id,
      operationId: id,
      buyerPublicKey: key.data.publicKey,
      buyerShareEnvelope: null,
      releaseEnvelope: null,
      mediatorShare: null,
      priceZatoshi: offer.data.priceZatoshi,
    };
    await tx.put("exchange", id, exchange, null);
    return { version: created.version, operation: created.data, exchange: viewExchange(exchange, actor) };
  });
}

function viewExchange(exchange: ExchangeData, actor: Actor) {
  const seller = actor.user.id === exchange.sellerId;
  const buyer = actor.user.id === exchange.buyerId;
  return {
    offerId: exchange.offerId,
    sellerId: exchange.sellerId,
    buyerId: exchange.buyerId,
    buyerPublicKey: seller ? exchange.buyerPublicKey : undefined,
    priceZatoshi: exchange.priceZatoshi,
    releaseReady: Boolean(exchange.releaseEnvelope),
    buyerShareAvailable: buyer && Boolean(exchange.buyerShareEnvelope),
    protocol: "shamir-2-of-3-mediator",
  };
}

export async function getExchange(tx: Tx, actor: Actor, id: string) {
  const operation = await mustGet<OperationRecord>(tx, "operation", id);
  assertParticipant(actor, operation.data.initiatorId, operation.data.participantIds);
  const exchange = await mustGet<ExchangeData>(tx, "exchange", id);
  return { version: operation.version, operation: operation.data, exchange: viewExchange(exchange.data, actor) };
}

export async function releaseExchange(
  tx: Tx,
  actor: Actor,
  id: string,
  input: { expectedVersion: number; buyerShareEnvelope: SealedBox; releaseEnvelope: SealedBox; mediatorShare: { index: number; bytes: string } },
) {
  assertPerson(actor);
  const operation = await mustGet<OperationRecord>(tx, "operation", id);
  if (operation.version !== input.expectedVersion) throw new AshError("conflict", "This exchange changed. Reload it.", 409);
  const exchange = await mustGet<ExchangeData>(tx, "exchange", id);
  if (actor.user.id !== exchange.data.sellerId) throw new AshError("forbidden", "Only the seller can authorize delivery.", 403);
  if (operation.data.state !== "awaiting_seller") throw new AshError("invalid_state", "Delivery was already authorized or the exchange is closed.", 409);
  const buyerShareEnvelope = assertSealedBox(input.buyerShareEnvelope);
  const releaseEnvelope = assertSealedBox(input.releaseEnvelope);
  const mediatorShare = shareFromJson(input.mediatorShare);
  if (mediatorShare.index !== 3) throw new AshError("invalid_key", "The mediator share must be index 3.");
  const next: ExchangeData = {
    ...exchange.data,
    buyerShareEnvelope,
    releaseEnvelope,
    mediatorShare: { index: 3, bytes: input.mediatorShare.bytes },
  };
  await tx.put("exchange", id, next, exchange.version);
  const saved = await saveOperation(
    tx,
    operation,
    {
      ...operation.data,
      state: "awaiting_payment",
      access: { kind: "delivery", entitled: false, restricted: true, note: "Delivery is authorized and waits for a payment ASH accepts." },
    },
    "delivery_authorized",
    "envelopes stored",
  );
  return { version: saved.version, operation: saved.data, exchange: viewExchange(next, actor) };
}

export async function payExchange(tx: Tx, actor: Actor, id: string, input: { expectedVersion: number; txId?: string }, idempotencyKey: string | null) {
  assertScope(actor, "pay");
  return idempotent(tx, `exchange-pay:${id}`, idempotencyKey, requestHash(input), async () => {
    const operation = await mustGet<OperationRecord>(tx, "operation", id);
    if (operation.version !== input.expectedVersion) throw new AshError("conflict", "This exchange changed. Reload it.", 409);
    const exchange = await mustGet<ExchangeData>(tx, "exchange", id);
    if (actor.user.id !== exchange.data.buyerId) throw new AshError("forbidden", "Only the buyer can pay for this exchange.", 403);
    if (operation.data.state !== "awaiting_payment" && operation.data.state !== "payment_observed") {
      throw new AshError("invalid_state", "The seller must authorize delivery before payment.", 409);
    }
    const cfg = config();
    const payment = input.txId
      ? await settleObserved(tx, {
          idempotencyKey: `exchange:${id}`,
          txId: input.txId,
          amountZatoshi: exchange.data.priceZatoshi,
          feeZatoshi: "0",
        })
      : await settleSimulated(tx, actor, {
          idempotencyKey: `exchange:${id}`,
          amountZatoshi: exchange.data.priceZatoshi,
          feeZatoshi: "0",
        });
    const satisfied = paymentSatisfies(payment, cfg.allowSimulated);
    if (input.txId && payment.status !== "observed" && !satisfied) {
      throw new AshError("payment_unverified", payment.reason || "The transaction was not observed.", 402);
    }
    const state = satisfied ? "payment_verified" : "payment_observed";
    const saved = await saveOperation(
      tx,
      operation,
      {
        ...operation.data,
        state,
        payment,
        access: {
          kind: "delivery",
          entitled: satisfied,
          restricted: !satisfied,
          note: satisfied ? "Payment accepted. The release envelope can be downloaded." : payment.reason || DISCLOSURES.observed,
        },
      },
      "payment_recorded",
      payment.mode,
      payment.txId,
    );
    return { version: saved.version, operation: saved.data, payment };
  });
}

export async function exchangePackage(tx: Tx, actor: Actor, id: string) {
  const operation = await mustGet<OperationRecord>(tx, "operation", id);
  const exchange = await mustGet<ExchangeData>(tx, "exchange", id);
  if (actor.user.id !== exchange.data.buyerId) throw new AshError("forbidden", "Only the buyer can download this package.", 403);
  if (!exchange.data.buyerShareEnvelope) throw new AshError("invalid_state", "The seller has not authorized delivery.", 409);
  const offer = await mustGet<OfferData>(tx, "offer", exchange.data.offerId);
  const cfg = config();
  const paid = Boolean(operation.data.payment && paymentSatisfies(operation.data.payment, cfg.allowSimulated));
  if (!paid) {
    return {
      paid: false,
      buyerShareEnvelope: exchange.data.buyerShareEnvelope,
      releaseEnvelope: null,
      pack: null,
      plaintextSha256: offer.data.plaintextSha256,
      ciphertextSha256: offer.data.ciphertextSha256,
    };
  }
  return {
    paid: true,
    buyerShareEnvelope: exchange.data.buyerShareEnvelope,
    releaseEnvelope: exchange.data.releaseEnvelope,
    pack: offer.data.pack,
    plaintextSha256: offer.data.plaintextSha256,
    ciphertextSha256: offer.data.ciphertextSha256,
  };
}

export async function failDelivery(tx: Tx, actor: Actor, id: string, expectedVersion: number) {
  assertPerson(actor);
  const operation = await mustGet<OperationRecord>(tx, "operation", id);
  if (operation.version !== expectedVersion) throw new AshError("conflict", "This exchange changed. Reload it.", 409);
  const exchange = await mustGet<ExchangeData>(tx, "exchange", id);
  if (actor.user.id !== exchange.data.buyerId) throw new AshError("forbidden", "Only the buyer can report a failed delivery.", 403);
  const saved = await saveOperation(
    tx,
    operation,
    {
      ...operation.data,
      state: "delivery_failed",
      access: { kind: "delivery", entitled: false, restricted: true, note: "Buyer reported that the release envelope did not decrypt. Recovery can release the mediator share." },
    },
    "delivery_failed",
    "buyer reported failure",
  );
  return { version: saved.version, operation: saved.data };
}

export async function recoverExchange(tx: Tx, actor: Actor, id: string) {
  const operation = await mustGet<OperationRecord>(tx, "operation", id);
  const exchange = await mustGet<ExchangeData>(tx, "exchange", id);
  if (actor.user.id !== exchange.data.buyerId) throw new AshError("forbidden", "Only the buyer can use recovery.", 403);
  if (operation.data.state !== "delivery_failed" && operation.data.state !== "recovered") {
    throw new AshError("invalid_state", "Recovery is available after a reported delivery failure.", 409);
  }
  const cfg = config();
  if (!operation.data.payment || !paymentSatisfies(operation.data.payment, cfg.allowSimulated)) {
    throw new AshError("payment_unverified", "Recovery does not run before ASH accepts the payment.", 402);
  }
  if (!exchange.data.mediatorShare) throw new AshError("invalid_state", "The seller did not deposit a mediator share.", 409);
  if (operation.data.state === "delivery_failed") {
    await saveOperation(
      tx,
      operation,
      {
        ...operation.data,
        state: "recovered",
        access: { kind: "delivery", entitled: true, restricted: false, note: "Mediator share released to the buyer. Combine it with share 1." },
      },
      "recovered",
      "mediator share released",
    );
  }
  return {
    mediatorShare: exchange.data.mediatorShare,
    buyerShareEnvelope: exchange.data.buyerShareEnvelope,
    disclosure: "This is one Shamir share. It does not decrypt the file by itself. The server never stored the content key.",
  };
}

export async function ackExchange(tx: Tx, actor: Actor, id: string, expectedVersion: number) {
  assertPerson(actor);
  const operation = await mustGet<OperationRecord>(tx, "operation", id);
  if (operation.version !== expectedVersion) throw new AshError("conflict", "This exchange changed. Reload it.", 409);
  const exchange = await mustGet<ExchangeData>(tx, "exchange", id);
  if (actor.user.id !== exchange.data.buyerId) throw new AshError("forbidden", "Only the buyer can reconcile delivery.", 403);
  if (operation.data.state === "recovered") {
    const completed = await saveOperation(tx, operation, { ...operation.data, state: "completed" }, "completed", "recovered exchange reconciled");
    return { version: completed.version, operation: completed.data };
  }
  const saved = await saveOperation(tx, operation, { ...operation.data, state: "delivered" }, "delivered", "buyer reconciled locally");
  const completed = await saveOperation(tx, saved, { ...saved.data, state: "completed" }, "completed", "exchange reconciled");
  return { version: completed.version, operation: completed.data };
}

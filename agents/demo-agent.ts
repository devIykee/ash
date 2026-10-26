import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { AshClient, encodePaymentSignature, parsePaymentRequired } from "@sdk";
import { generateX25519, openBox, publicFromPrivate, sealTo } from "@/crypto/box";
import { decryptPack, encryptPack, sha256Hex } from "@/crypto/pack";
import { combineShares, shareToJson, splitSecret } from "@/crypto/shamir";

const baseUrl = process.env.ASH_BASE_URL || "http://127.0.0.1:3000";
const outDir = path.resolve("demo-output");

function idempotency(name: string): Record<string, string> {
  return { "idempotency-key": `demo-${name}`.padEnd(12, "0") };
}

async function main(): Promise<void> {
  const seller = new AshClient(baseUrl);
  const operator = new AshClient(baseUrl);
  const agent = new AshClient(baseUrl);
  await seller.signIn("user_noor");
  const note = utf8ToBytes("ASH demo note. This file was encrypted in the agent process and decrypted only after a simulated shielded payment.");
  const encrypted = encryptPack(note);
  const published = await seller.request<{ offer: { id: string } }>("POST", "/api/ash/offers", {
    title: "Demo research note",
    description: "A short note used by the deterministic ASH agent.",
    priceZec: "0.001",
    plaintextSha256: encrypted.pack.plaintextSha256,
    pack: encrypted.pack,
  }, idempotency("offer"));
  if (published.status !== 201) throw new Error(`Offer publish failed: ${published.status} ${JSON.stringify(published.data)}`);
  const offerId = published.data.offer.id;

  await operator.signIn("user_avery");
  const minted = await operator.request<{ token: string }>("POST", "/api/ash/agents", {
    name: "Demo buyer",
    budgetZec: "0.01",
    scopes: ["read", "pay", "exchange"],
  });
  if (minted.status !== 201) throw new Error(`Agent token failed: ${minted.status}`);
  agent.useToken(minted.data.token);

  const catalog = await agent.request<{ items: { id: string; title: string; priceZatoshi: string }[] }>("GET", "/api/ash/offers");
  const offer = catalog.data.items.find((item) => item.id === offerId);
  if (!offer) throw new Error("Agent could not see the published offer.");

  const device = generateX25519();
  const registered = await agent.request("POST", "/api/ash/keys", { publicKey: device.publicKey });
  if (registered.status !== 200) throw new Error("Key registration failed.");
  const opened = await agent.request<{ version: number; operation: { id: string } }>(
    "POST",
    "/api/ash/exchanges",
    { offerId },
    idempotency("exchange"),
  );
  if (opened.status !== 201) throw new Error(`Exchange open failed: ${opened.status} ${JSON.stringify(opened.data)}`);
  const exchangeId = opened.data.operation.id;

  const sellerView = await seller.request<{ version: number; exchange: { buyerPublicKey: string } }>("GET", `/api/ash/exchanges/${exchangeId}`);
  const shares = splitSecret(encrypted.key);
  const released = await seller.request("POST", `/api/ash/exchanges/${exchangeId}/release`, {
    expectedVersion: sellerView.data.version,
    buyerShareEnvelope: sealTo(sellerView.data.exchange.buyerPublicKey, shares[0].bytes),
    releaseEnvelope: sealTo(sellerView.data.exchange.buyerPublicKey, shares[1].bytes),
    mediatorShare: shareToJson(shares[2]),
  });
  if (released.status !== 200) throw new Error(`Release failed: ${released.status} ${JSON.stringify(released.data)}`);

  const beforePay = await agent.request<{ version: number }>("GET", `/api/ash/exchanges/${exchangeId}`);
  const paid = await agent.request<{ version: number; operation: { state: string } }>(
    "POST",
    `/api/ash/exchanges/${exchangeId}/pay`,
    { expectedVersion: beforePay.data.version },
    idempotency("pay"),
  );
  if (paid.status !== 200 || paid.data.operation.state !== "payment_verified") {
    throw new Error(`Payment was not accepted: ${JSON.stringify(paid.data)}`);
  }
  const repeated = await agent.request("POST", `/api/ash/exchanges/${exchangeId}/pay`, { expectedVersion: beforePay.data.version }, idempotency("pay"));
  if (repeated.status !== 200) throw new Error("Idempotent replay should return the original payment.");

  const bundle = await agent.request<{
    paid: boolean;
    pack: { plaintextSha256: string; chunks: { iv: string; ciphertext: string }[]; v: 1; chunkSize: number };
    buyerShareEnvelope: Parameters<typeof openBox>[1];
    releaseEnvelope: Parameters<typeof openBox>[1];
    plaintextSha256: string;
  }>("GET", `/api/ash/exchanges/${exchangeId}/package`);
  if (!bundle.data.paid || !bundle.data.pack || !bundle.data.releaseEnvelope) throw new Error("Package was not released.");
  const contentKey = combineShares([
    { index: 1, bytes: openBox(device.privateKey, bundle.data.buyerShareEnvelope) },
    { index: 2, bytes: openBox(device.privateKey, bundle.data.releaseEnvelope) },
  ]);
  const plaintext = decryptPack(bundle.data.pack, contentKey);
  if (sha256Hex(plaintext) !== bundle.data.plaintextSha256) throw new Error("Plaintext hash mismatch.");

  const research = await agent.request<unknown>("GET", "/api/v1/paid/research");
  if (research.status !== 402) throw new Error(`Expected 402, received ${research.status}.`);
  const challenge = parsePaymentRequired(research.headers.get("payment-required"));
  const challengeId = challenge.accepts[0]?.extra.challengeId;
  if (!challengeId || challenge.accepts[0]?.scheme !== "zcash-shielded") throw new Error("Challenge was not shielded.");
  const settlement = await agent.request<{ paymentRef: string }>("POST", `/api/ash/challenges/${challengeId}/pay`);
  if (settlement.status !== 200) throw new Error(`Challenge payment failed: ${settlement.status}`);
  const fulfilled = await agent.request<{ text: string }>("GET", "/api/v1/paid/research", undefined, {
    "payment-signature": encodePaymentSignature({
      challengeId,
      paymentRef: settlement.data.paymentRef,
      network: challenge.accepts[0].network,
    }),
  });
  if (fulfilled.status !== 200) throw new Error(`Paid request failed: ${fulfilled.status} ${JSON.stringify(fulfilled.data)}`);
  const replay = await agent.request("GET", "/api/v1/paid/research", undefined, {
    "payment-signature": encodePaymentSignature({
      challengeId,
      paymentRef: settlement.data.paymentRef,
      network: challenge.accepts[0].network,
    }),
  });
  if (replay.status !== 409) throw new Error(`Replay should be rejected, received ${replay.status}.`);

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "research-note.txt"), plaintext);
  await writeFile(
    path.join(outDir, "receipt.json"),
    JSON.stringify(
      {
        offerId,
        exchangeId,
        plaintextSha256: sha256Hex(plaintext),
        paymentState: paid.data.operation.state,
        apiNote: fulfilled.data.text,
        devicePublicKey: publicFromPrivate(device.privateKey),
      },
      null,
      2,
    ),
  );
  console.log(`ASH demo agent wrote ${path.join(outDir, "research-note.txt")}`);
  console.log("Payment mode is whatever the server is configured to use. The default is simulated.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

// End-to-end check of every ASH module over HTTP.
// Usage: ASH_BASE_URL=http://127.0.0.1:3000 pnpm smoke
// It reads /api/ash/health and adapts to the server's network (testnet or mainnet)
// and payment mode (simulated or chain). In chain mode, set SMOKE_TXID to a
// transaction id the configured node knows, so observation can be exercised.
import { bech32 } from "bech32";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { AshClient, encodePaymentSignature, parsePaymentRequired } from "@sdk";
import { generateX25519, openBox, sealTo } from "@/crypto/box";
import { decryptPack, encryptPack, sha256Hex } from "@/crypto/pack";
import { combineShares, shareToJson, splitSecret } from "@/crypto/shamir";

const baseUrl = (process.env.ASH_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const run = Date.now().toString(36);
const txId = (process.env.SMOKE_TXID || "ab".repeat(32)).toLowerCase();
const unknownTx = "cd".repeat(32);

type Health = {
  network: "testnet" | "mainnet";
  paymentMode: "simulated" | "chain";
  allowSimulated: boolean;
  payToConfigured: boolean;
  store: string;
};

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail: unknown = ""): void {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name} ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
}

function key(name: string): Record<string, string> {
  return { "idempotency-key": `smoke-${run}-${name}` };
}

// Structurally valid Sapling addresses for the server's network. They are derived
// from a hash, are not wallet addresses, and are never paid.
function sampleAddress(network: Health["network"], seed: string): string {
  const payload = sha256(utf8ToBytes(`ash-smoke:${seed}`));
  const bytes = new Uint8Array(43);
  bytes.set(payload, 0);
  bytes.set(payload.slice(0, 11), 32);
  return bech32.encode(network === "mainnet" ? "zs" : "ztestsapling", bech32.toWords(bytes), 512);
}

async function main(): Promise<void> {
  const probe = new AshClient(baseUrl);
  const health = await probe.request<Health>("GET", "/api/ash/health");
  check("health responds", health.status === 200, health.status);
  const { network, allowSimulated } = health.data;
  const practice = allowSimulated;
  console.log(`\nASH at ${baseUrl}: ${network}, ${health.data.paymentMode} payments, ${health.data.store} store\n`);

  const avery = new AshClient(baseUrl);
  const noor = new AshClient(baseUrl);
  const jules = new AshClient(baseUrl);
  const sam = new AshClient(baseUrl);
  await Promise.all([avery.signIn("user_avery"), noor.signIn("user_noor"), jules.signIn("user_jules"), sam.signIn("user_sam")]);
  const who = await jules.request<{ user: { id: string } | null }>("GET", "/api/ash/session");
  check("session sign-in", who.data.user?.id === "user_jules", who.data);

  console.log("Payroll");
  const wrongNet = network === "mainnet" ? "testnet" : "mainnet";
  const rejected = await avery.request<{ payroll: { errors: unknown[] } }>("POST", "/api/ash/payroll", {
    name: "Wrong network",
    lines: [{ label: "X", address: sampleAddress(wrongNet, "x"), amountZec: "0.01" }],
  }, key("payroll-bad"));
  check(`payroll rejects a ${wrongNet} address`, rejected.status === 201 && rejected.data.payroll.errors.length === 1, rejected.data);
  const payroll = await avery.request<{ version: number; operation: { id: string; state: string } }>("POST", "/api/ash/payroll", {
    name: `Smoke ${run}`,
    lines: [
      { label: "Ada", address: sampleAddress(network, "ada"), amountZec: "0.01" },
      { label: "Ben", address: sampleAddress(network, "ben"), amountZec: "0.02" },
    ],
  }, key("payroll"));
  check("payroll validates", payroll.status === 201 && payroll.data.operation.state === "validated", payroll.data);
  const payrollId = payroll.data.operation.id;
  const authorized = await avery.request<{ version: number; operation: { state: string } }>("POST", `/api/ash/payroll/${payrollId}/authorize`, { expectedVersion: payroll.data.version });
  check("payroll authorizes", authorized.data.operation?.state === "authorized", authorized.data);
  const executed = await avery.request<{ version: number; operation: { state: string }; payroll: { lines: { id: string; state: string }[] }; error?: { code: string } }>(
    "POST",
    `/api/ash/payroll/${payrollId}/execute`,
    { expectedVersion: authorized.data.version },
  );
  if (practice) {
    check("payroll executes", executed.data.operation?.state === "completed", executed.data);
  } else {
    check("payroll execute asks for wallet tx ids", executed.status === 400 && executed.data.error?.code === "txid_required", executed.data);
    const report = await avery.request<{ version: number; lines: { id: string }[] }>("GET", `/api/ash/payroll/${payrollId}`);
    const recorded = await avery.request<{ operation: { state: string }; payroll: { lines: { state: string }[] } }>(
      "POST",
      `/api/ash/payroll/${payrollId}/lines/${report.data.lines[0].id}/record`,
      { expectedVersion: report.data.version, txId },
    );
    check("payroll line records an observed tx id", recorded.data.payroll?.lines[0].state === "observed", recorded.data);
    check("observed line does not complete the run", recorded.data.operation?.state === "partially_completed", recorded.data);
  }
  const aggregate = await sam.request<{ recipientDetails: string; proofValid: boolean }>("GET", `/api/ash/payroll/${payrollId}/report?view=aggregate`);
  check("auditor gets aggregate report only", aggregate.data.recipientDetails === "omitted" && aggregate.data.proofValid, aggregate.data);

  console.log("Tips and receipts");
  const tip = await noor.request<{ operation: { id: string }; uri: { uri: string } }>("POST", "/api/ash/tips", {
    title: `Smoke jar ${run}`,
    address: sampleAddress(network, "tips"),
    suggestedZec: ["0.001"],
    statement: "Smoke test",
  }, key("tip"));
  check("tip page publishes", tip.status === 201, tip.data);
  check(`tip ZIP-321 link targets ${network}`, tip.data.uri?.uri.startsWith(`zcash:${network === "mainnet" ? "zs1" : "ztestsapling1"}`), tip.data.uri);
  const tipId = tip.data.operation.id;
  const guest = new AshClient(baseUrl);
  if (practice) {
    const paid = await guest.request<{ receipt: { id: string; network: string } | null }>("POST", `/api/ash/tips/${tipId}/pay`, { amountZec: "0.001", memo: "thanks", includeMemo: true }, key("tip-pay"));
    check("guest tip issues a receipt", Boolean(paid.data.receipt), paid.data);
    check(`receipt says ${network}`, paid.data.receipt?.network === network, paid.data.receipt);
    const receipt = await guest.request<{ signature: string }>("GET", `/api/ash/receipts/${paid.data.receipt?.id}`);
    check("receipt verifies", receipt.status === 200 && Boolean(receipt.data.signature), receipt.data);
  } else {
    const noTx = await guest.request<{ error?: { code: string } }>("POST", `/api/ash/tips/${tipId}/pay`, { amountZec: "0.001" });
    check("tip without tx id is refused", noTx.data.error?.code === "txid_required", noTx.data);
    const observed = await guest.request<{ receipt: unknown; payment: { status: string } }>("POST", `/api/ash/tips/${tipId}/pay`, { amountZec: "0.001", txId }, key("tip-pay-chain"));
    check("tip tx id is observed, no receipt", observed.data.payment?.status === "observed" && observed.data.receipt === null, observed.data);
    const missing = await guest.request<{ error?: { code: string } }>("POST", `/api/ash/tips/${tipId}/pay`, { amountZec: "0.001", txId: unknownTx }, key("tip-pay-missing"));
    check("unknown tx id is refused", missing.status === 402, missing.data);
  }

  console.log("Encrypted exchange");
  const note = utf8ToBytes(`smoke file ${run}`);
  const encrypted = encryptPack(note);
  const offer = await noor.request<{ offer: { id: string; walletUri: string | null; network: string } }>("POST", "/api/ash/offers", {
    title: `Smoke file ${run}`,
    description: "Smoke",
    priceZec: "0.002",
    payTo: sampleAddress(network, "seller"),
    plaintextSha256: encrypted.pack.plaintextSha256,
    pack: encrypted.pack,
  }, key("offer"));
  check("offer publishes with a wallet request", offer.status === 201 && Boolean(offer.data.offer.walletUri), offer.data);
  const offerId = offer.data.offer.id;
  const device = generateX25519();
  await jules.request("POST", "/api/ash/keys", { publicKey: device.publicKey });
  const opened = await jules.request<{ operation: { id: string } }>("POST", "/api/ash/exchanges", { offerId }, key("exchange"));
  check("buyer opens exchange", opened.status === 201, opened.data);
  const exchangeId = opened.data.operation.id;
  const sellerView = await noor.request<{ version: number; exchange: { buyerPublicKey: string } }>("GET", `/api/ash/exchanges/${exchangeId}`);
  const shares = splitSecret(encrypted.key);
  const released = await noor.request("POST", `/api/ash/exchanges/${exchangeId}/release`, {
    expectedVersion: sellerView.data.version,
    buyerShareEnvelope: sealTo(sellerView.data.exchange.buyerPublicKey, shares[0].bytes),
    releaseEnvelope: sealTo(sellerView.data.exchange.buyerPublicKey, shares[1].bytes),
    mediatorShare: shareToJson(shares[2]),
  });
  check("seller allows delivery", released.status === 200, released.data);
  const before = await jules.request<{ version: number }>("GET", `/api/ash/exchanges/${exchangeId}`);
  const pay = await jules.request<{ version: number; operation: { state: string } }>(
    "POST",
    `/api/ash/exchanges/${exchangeId}/pay`,
    practice ? { expectedVersion: before.data.version } : { expectedVersion: before.data.version, txId },
    key("exchange-pay"),
  );
  const bundle = await jules.request<{ paid: boolean; pack: Parameters<typeof decryptPack>[0] | null; buyerShareEnvelope: Parameters<typeof openBox>[1]; releaseEnvelope: Parameters<typeof openBox>[1] | null; plaintextSha256: string }>(
    "GET",
    `/api/ash/exchanges/${exchangeId}/package`,
  );
  if (practice) {
    check("exchange payment verified", pay.data.operation?.state === "payment_verified", pay.data);
    const contentKey = combineShares([
      { index: 1, bytes: openBox(device.privateKey, bundle.data.buyerShareEnvelope) },
      { index: 2, bytes: openBox(device.privateKey, bundle.data.releaseEnvelope!) },
    ]);
    const plain = decryptPack(bundle.data.pack!, contentKey);
    check("buyer decrypts the file", sha256Hex(plain) === bundle.data.plaintextSha256);
    const failed = await jules.request<{ version: number }>("POST", `/api/ash/exchanges/${exchangeId}/fail`, { expectedVersion: pay.data.version });
    const recovered = await jules.request<{ mediatorShare: { index: number } }>("POST", `/api/ash/exchanges/${exchangeId}/recover`, {});
    check("recovery releases mediator share", failed.status === 200 && recovered.data.mediatorShare?.index === 3, recovered.data);
    const acked = await jules.request<{ operation: { state: string } }>("POST", `/api/ash/exchanges/${exchangeId}/ack`, { expectedVersion: failed.data.version + 1 });
    check("recovered exchange reconciles", acked.data.operation?.state === "completed", acked.data);
  } else {
    check("exchange payment only observed", pay.data.operation?.state === "payment_observed", pay.data);
    check("file stays locked on observation", bundle.data.paid === false && bundle.data.pack === null, bundle.data.paid);
  }

  console.log("Paid API (x402)");
  const first = await jules.request<{ accepts: { network: string }[]; error?: { code: string } }>("GET", "/api/v1/paid/research");
  if (!health.data.payToConfigured) {
    check("paid API explains the missing pay-to address", first.status === 503 && first.data.error?.code === "not_configured", first.data);
  } else {
    check("paid API returns 402", first.status === 402, first.status);
    const challenge = parsePaymentRequired(first.headers.get("payment-required"));
    check(`challenge network is zcash:${network}`, challenge.accepts[0].network === `zcash:${network}`, challenge.accepts[0].network);
    const challengeId = challenge.accepts[0].extra.challengeId;
    const settled = await jules.request<{ paymentRef: string | null; status: string }>("POST", `/api/ash/challenges/${challengeId}/pay`, practice ? {} : { txId });
    if (practice) {
      check("challenge payment issues a reference", Boolean(settled.data.paymentRef), settled.data);
      const signature = encodePaymentSignature({ challengeId, paymentRef: settled.data.paymentRef!, network: challenge.accepts[0].network });
      const served = await jules.request<{ text: string }>("GET", "/api/v1/paid/research", undefined, { "payment-signature": signature });
      check("paid request is served once", served.status === 200, served.data);
      const replay = await jules.request("GET", "/api/v1/paid/research", undefined, { "payment-signature": signature });
      check("replay is rejected", replay.status === 409, replay.status);
    } else {
      check("observed challenge gets no reference", settled.status === 200 && settled.data.paymentRef === null && settled.data.status === "observed", settled.data);
    }
  }

  console.log("Subscriptions");
  const plan = await noor.request<{ id: string }>("POST", "/api/ash/plans", {
    title: `Smoke feed ${run}`,
    description: "Smoke",
    priceZec: "0.001",
    payTo: sampleAddress(network, "plan"),
    intervalDays: 30,
    graceDays: 3,
  });
  check("plan publishes", plan.status === 201, plan.data);
  const sub = await jules.request<{ version: number; operation: { id: string; state: string } }>("POST", "/api/ash/subscriptions", { offerId: plan.data.id }, key("sub"));
  check("subscription starts awaiting payment", sub.data.operation?.state === "awaiting_payment", sub.data);
  const renewed = await jules.request<{ version: number; operation: { state: string }; effective: { entitled: boolean } }>(
    "POST",
    `/api/ash/subscriptions/${sub.data.operation.id}/renew`,
    practice ? { expectedVersion: sub.data.version } : { expectedVersion: sub.data.version, txId },
    key("renew"),
  );
  if (practice) check("renewal grants access", renewed.data.effective?.entitled === true && renewed.data.operation.state === "completed", renewed.data);
  else check("observed renewal does not grant access", renewed.data.operation?.state === "payment_observed" && renewed.data.effective?.entitled === false, renewed.data);
  const cancelled = await jules.request<{ operation: { state: string } }>("POST", `/api/ash/subscriptions/${sub.data.operation.id}/cancel`, { expectedVersion: renewed.data.version });
  check("subscription cancels", cancelled.data.operation?.state === "cancelled", cancelled.data);

  console.log("Audit grants");
  const grant = await avery.request<{ version: number; operation: { id: string } }>("POST", "/api/ash/grants", {
    auditorId: "user_sam",
    capability: "filtered_report",
    scopeNote: "October payroll totals",
    applicationExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    reportText: "Total 0.03 ZEC across two lines.",
  });
  check("grant is created", grant.status === 201, grant.data);
  const seen = await sam.request<{ reportText?: string }>("GET", `/api/ash/grants/${grant.data.operation.id}`);
  check("auditor reads the grant", seen.status === 200, seen.data);
  const viewingKey = await avery.request("POST", "/api/ash/grants", {
    auditorId: "user_sam",
    capability: "ufvk",
    scopeNote: "uview1secretmaterial",
    applicationExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  check("viewing key material is rejected", viewingKey.status === 400, viewingKey.status);
  const withdrawn = await avery.request("POST", `/api/ash/grants/${grant.data.operation.id}/withdraw`, { expectedVersion: grant.data.version });
  check("grant is withdrawn", withdrawn.status === 200, withdrawn.data);

  console.log("Memo check, evidence, agents");
  const memo = await noor.request("POST", "/api/ash/memo-checks", { findingCount: 2, dismissedCount: 1, rulesVersion: "ash-memo-1" });
  check("memo check counts are stored", memo.status === 201, memo.data);
  const evidence = await avery.request<{ pack: Record<string, unknown> }>("POST", "/api/ash/evidence", { operationId: payrollId, arbiterPublicKey: generateX25519().publicKey });
  check("evidence package seals", evidence.status === 201, evidence.data);
  const verified = await avery.request<{ valid: boolean }>("POST", "/api/ash/evidence/verify", { pack: evidence.data.pack });
  check("evidence package verifies", verified.data.valid === true, verified.data);
  const minted = await avery.request<{ token: string; agent: { id: string } }>("POST", "/api/ash/agents", { name: "Smoke agent", budgetZec: "0.0001", scopes: ["read", "pay"] });
  check("agent token is minted", minted.status === 201, minted.data);
  const bot = new AshClient(baseUrl);
  bot.useToken(minted.data.token);
  const botSession = await bot.request<{ user: { kind: string } | null }>("GET", "/api/ash/session");
  check("agent token authenticates", botSession.data.user?.kind === "agent", botSession.data);
  const revoked = await avery.request("DELETE", `/api/ash/agents/${minted.data.agent.id}`);
  const after = await bot.request("GET", "/api/ash/overview");
  check("revoked token stops working", revoked.status === 200 && after.status === 403, after.status);

  console.log("Pages");
  const pages: [string, AshClient][] = [
    ["/", avery], ["/workspace", avery], ["/payments", avery], ["/payments/payroll", avery], [`/payments/payroll/${payrollId}`, avery],
    ["/payments/payroll/new", avery], ["/payments/tips", noor], ["/payments/tips/new", noor], [`/payments/tips/${tipId}`, guest],
    ["/payments/subscriptions", jules], ["/commerce", jules], ["/commerce/new", noor], [`/commerce/offers/${offerId}`, jules],
    [`/commerce/exchanges/${exchangeId}`, jules], ["/privacy", avery], ["/privacy/grants", avery], ["/privacy/memo", avery],
    ["/operations", avery], [`/operations/${payrollId}`, avery], ["/operations/verify", avery], ["/agents", avery], ["/help", avery], ["/docs", avery],
  ];
  for (const [page, client] of pages) {
    const response = await fetch(`${baseUrl}${page}`, { headers: client.cookie ? { cookie: client.cookie } : {} });
    check(`GET ${page}`, response.status === 200, response.status);
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});

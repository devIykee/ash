// End-to-end check of every ASH module over HTTP.
// Usage: ASH_BASE_URL=http://127.0.0.1:3000 SMOKE_MODE=practice pnpm smoke
// SMOKE_MODE is practice (default), testnet, or mainnet.
// Practice runs every flow to completion with practice payments.
// Testnet and mainnet register freshly generated receiving keys, create real payment requests
// for every flow, and check them against the live chain through lightwalletd. Nothing is paid,
// so every request must stay open and every unlock must stay locked.
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { AshClient, encodePaymentSignature, parsePaymentRequired } from "@sdk";
import { generateX25519, openBox, sealTo } from "@/crypto/box";
import { decryptPack, encryptPack, sha256Hex } from "@/crypto/pack";
import { combineShares, shareToJson, splitSecret } from "@/crypto/shamir";
import { makeWallet } from "../tests/zcash-fixtures";

const baseUrl = (process.env.ASH_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const mode = (process.env.SMOKE_MODE || "practice") as "practice" | "testnet" | "mainnet";
const network = mode === "mainnet" ? "mainnet" : "testnet";
const practice = mode === "practice";
const run = Date.now().toString(36);

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

type Request = { ref: string; network: string; address: string; memo: string; uri: string; status: string; amountZatoshi: string };

async function main(): Promise<void> {
  const client = () => new AshClient(baseUrl, mode);
  const probe = client();
  const health = await probe.request<{ status: string; mode: string; modes: string[]; store: string; network: string }>("GET", "/api/ash/health");
  check("health responds", health.status === 200, health.status);
  check(`server offers ${mode}`, health.data.modes?.includes(mode), health.data.modes);
  check(`requests run in ${mode}`, health.data.mode === mode && health.data.network === network, health.data);
  console.log(`\nASH at ${baseUrl}: ${mode} mode, ${health.data.store} store\n`);

  const avery = client();
  const noor = client();
  const jules = client();
  const sam = client();
  await Promise.all([avery.signIn("user_avery"), noor.signIn("user_noor"), jules.signIn("user_jules"), sam.signIn("user_sam")]);
  const who = await jules.request<{ user: { id: string } | null }>("GET", "/api/ash/session");
  check("session sign-in", who.data.user?.id === "user_jules", who.data);

  const noorWallet = makeWallet(network);
  const averyWallet = makeWallet(network);
  const ada = makeWallet(network);
  const ben = makeWallet(network);
  if (!practice) {
    console.log("Receiving keys");
    const savedNoor = await noor.request<{ key: { saplingAddress: string } }>("POST", "/api/ash/wallet-keys", { network, address: noorWallet.address, viewingKey: noorWallet.viewingKey });
    check("creator receiving key is verified and saved", savedNoor.status === 201 && savedNoor.data.key?.saplingAddress === noorWallet.address, savedNoor.data);
    const savedAvery = await avery.request("POST", "/api/ash/wallet-keys", { network, address: averyWallet.address, viewingKey: averyWallet.viewingKey });
    check("operator receiving key is verified and saved", savedAvery.status === 201, savedAvery.data);
    const mismatch = await noor.request("POST", "/api/ash/wallet-keys", { network, address: noorWallet.address, viewingKey: ada.viewingKey });
    check("a key for a different address is rejected", mismatch.status === 400, mismatch.data);
  }

  console.log("Payroll");
  const wrongNetwork = makeWallet(network === "mainnet" ? "testnet" : "mainnet");
  const rejected = await avery.request<{ payroll: { errors: unknown[] } }>("POST", "/api/ash/payroll", { name: "Wrong network", lines: [{ label: "X", address: wrongNetwork.address, amountZec: "0.01" }] }, key("payroll-bad"));
  check("payroll rejects an address for the other network", rejected.status === 201 && rejected.data.payroll.errors.length === 1, rejected.data);
  const payroll = await avery.request<{ version: number; operation: { id: string; state: string } }>("POST", "/api/ash/payroll", {
    name: `Smoke ${run}`,
    lines: [
      { label: "Ada", address: ada.address, amountZec: "0.01" },
      { label: "Ben", address: ben.address, amountZec: "0.02" },
    ],
  }, key("payroll"));
  check("payroll validates", payroll.status === 201 && payroll.data.operation.state === "validated", payroll.data);
  const payrollId = payroll.data.operation.id;
  const authorized = await avery.request<{ version: number; operation: { state: string } }>("POST", `/api/ash/payroll/${payrollId}/authorize`, { expectedVersion: payroll.data.version });
  check("payroll authorizes", authorized.data.operation?.state === "authorized", authorized.data);
  if (practice) {
    const executed = await avery.request<{ operation: { state: string } }>("POST", `/api/ash/payroll/${payrollId}/execute`, { expectedVersion: authorized.data.version });
    check("payroll executes", executed.data.operation?.state === "completed", executed.data);
  } else {
    const bogus = await avery.request<{ error?: { code: string } }>("POST", `/api/ash/payroll/${payrollId}/verify`, { txId: "cd".repeat(32) });
    check(`an unknown transaction does not pay any line (live ${network})`, bogus.status === 402, bogus.data);
  }
  const aggregate = await sam.request<{ recipientDetails: string; proofValid: boolean }>("GET", `/api/ash/payroll/${payrollId}/report?view=aggregate`);
  check("auditor gets aggregate report only", aggregate.data.recipientDetails === "omitted" && aggregate.data.proofValid, aggregate.data);

  console.log("Tips and receipts");
  const tip = await noor.request<{ operation: { id: string }; tip: { address: string } }>("POST", "/api/ash/tips", { title: `Smoke jar ${run}`, address: noorWallet.address, suggestedZec: ["0.001"], statement: "Smoke test" }, key("tip"));
  check("tip page publishes", tip.status === 201, tip.data);
  const tipId = tip.data.operation.id;
  const guest = client();
  const paidTip = await guest.request<{ receipt: { id: string; network: string } | null; request: Request | null }>("POST", `/api/ash/tips/${tipId}/pay`, { amountZec: "0.001", memo: "thanks", includeMemo: true }, key("tip-pay"));
  if (practice) {
    check("guest tip issues a receipt", Boolean(paidTip.data.receipt), paidTip.data);
    const receipt = await guest.request<{ signature: string }>("GET", `/api/ash/receipts/${paidTip.data.receipt?.id}`);
    check("receipt verifies", receipt.status === 200 && Boolean(receipt.data.signature), receipt.data);
  } else {
    const request = paidTip.data.request;
    check("tip creates a real payment request", Boolean(request) && request!.network === network && request!.address === noorWallet.address, paidTip.data);
    check("the request carries a unique memo reference", Boolean(request?.memo.startsWith("ASH ")) && Boolean(request?.uri.includes("memo=")), request);
    const scanned = await guest.request<Request>("POST", `/api/ash/payment-requests/${request?.ref}/check`, {});
    check(`checking scans the live ${network} chain and stays open`, scanned.status === 200 && scanned.data.status === "open", scanned.data);
  }

  console.log("Encrypted exchange");
  const encrypted = encryptPack(utf8ToBytes(`smoke file ${run}`));
  const offer = await noor.request<{ offer: { id: string; walletUri: string | null; payTo: string | null } }>("POST", "/api/ash/offers", {
    title: `Smoke file ${run}`,
    description: "Smoke",
    priceZec: "0.002",
    payTo: noorWallet.address,
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
  const pay = await jules.request<{ version: number; operation: { state: string }; request: Request | null }>("POST", `/api/ash/exchanges/${exchangeId}/pay`, { expectedVersion: before.data.version }, key("exchange-pay"));
  const bundle = await jules.request<{ paid: boolean; pack: Parameters<typeof decryptPack>[0] | null; buyerShareEnvelope: Parameters<typeof openBox>[1]; releaseEnvelope: Parameters<typeof openBox>[1] | null; plaintextSha256: string }>("GET", `/api/ash/exchanges/${exchangeId}/package`);
  if (practice) {
    check("exchange payment verified", pay.data.operation?.state === "payment_verified", pay.data);
    const contentKey = combineShares([
      { index: 1, bytes: openBox(device.privateKey, bundle.data.buyerShareEnvelope) },
      { index: 2, bytes: openBox(device.privateKey, bundle.data.releaseEnvelope!) },
    ]);
    check("buyer decrypts the file", sha256Hex(decryptPack(bundle.data.pack!, contentKey)) === bundle.data.plaintextSha256);
  } else {
    check("exchange returns a payment request to the seller's verified address", pay.data.request?.address === noorWallet.address, pay.data);
    check("file stays locked until a payment confirms", bundle.data.paid === false && bundle.data.pack === null, bundle.data.paid);
    const bogus = await jules.request<Request>("POST", `/api/ash/payment-requests/${pay.data.request?.ref}/check`, { txId: "cd".repeat(32) });
    check(`an unknown transaction id is not accepted (live ${network})`, bogus.status === 200 && bogus.data.status === "open", bogus.data);
  }

  console.log("Paid API (x402)");
  const first = await jules.request<{ accepts: { network: string }[] }>("GET", "/api/v1/paid/research");
  check("paid API returns 402", first.status === 402, first.data);
  const challenge = parsePaymentRequired(first.headers.get("payment-required"));
  const accept = challenge.accepts[0];
  check(`challenge network is zcash:${network}`, accept.network === `zcash:${network}`, accept.network);
  const challengeId = accept.extra.challengeId;
  const settled = await jules.request<{ paymentRef: string | null }>("POST", `/api/ash/challenges/${challengeId}/pay`, {});
  if (practice) {
    check("challenge payment issues a reference", Boolean(settled.data.paymentRef), settled.data);
    const signature = encodePaymentSignature({ challengeId, paymentRef: settled.data.paymentRef!, network: accept.network });
    const served = await jules.request("GET", "/api/v1/paid/research", undefined, { "payment-signature": signature });
    check("paid request is served once", served.status === 200, served.data);
    const replay = await jules.request("GET", "/api/v1/paid/research", undefined, { "payment-signature": signature });
    check("replay is rejected", replay.status === 409, replay.status);
  } else {
    const extra = accept.extra as unknown as { memo: string | null; paymentRequestRef: string | null };
    check("challenge pays the operator's verified address with a memo", accept.payTo === averyWallet.address && Boolean(extra.memo), accept);
    check("no payment reference before a confirmed payment", settled.status === 200 && settled.data.paymentRef === null, settled.data);
  }

  console.log("Subscriptions");
  const plan = await noor.request<{ id: string }>("POST", "/api/ash/plans", { title: `Smoke feed ${run}`, description: "Smoke", priceZec: "0.001", payTo: noorWallet.address, intervalDays: 30, graceDays: 3 });
  check("plan publishes", plan.status === 201, plan.data);
  const sub = await jules.request<{ version: number; operation: { id: string; state: string } }>("POST", "/api/ash/subscriptions", { offerId: plan.data.id }, key("sub"));
  check("subscription starts awaiting payment", sub.data.operation?.state === "awaiting_payment", sub.data);
  const renewed = await jules.request<{ version: number; operation: { state: string }; effective: { entitled: boolean }; request: Request | null }>("POST", `/api/ash/subscriptions/${sub.data.operation.id}/renew`, { expectedVersion: sub.data.version }, key("renew"));
  if (practice) check("renewal grants access", renewed.data.effective?.entitled === true, renewed.data);
  else check("renewal returns a payment request and grants nothing yet", Boolean(renewed.data.request) && renewed.data.effective?.entitled === false, renewed.data);
  const cancelled = await jules.request<{ operation: { state: string } }>("POST", `/api/ash/subscriptions/${sub.data.operation.id}/cancel`, { expectedVersion: renewed.data.version });
  check("subscription cancels", cancelled.data.operation?.state === "cancelled", cancelled.data);

  console.log("Audit grants, memo check, evidence, agents");
  const grant = await avery.request<{ version: number; operation: { id: string } }>("POST", "/api/ash/grants", {
    auditorId: "user_sam",
    capability: "filtered_report",
    scopeNote: "October payroll totals",
    applicationExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    reportText: "Total 0.03 ZEC across two lines.",
  });
  check("grant is created", grant.status === 201, grant.data);
  const seen = await sam.request("GET", `/api/ash/grants/${grant.data.operation.id}`);
  check("auditor reads the grant", seen.status === 200, seen.data);
  const withdrawn = await avery.request("POST", `/api/ash/grants/${grant.data.operation.id}/withdraw`, { expectedVersion: grant.data.version });
  check("grant is withdrawn", withdrawn.status === 200, withdrawn.data);
  const memo = await noor.request("POST", "/api/ash/memo-checks", { findingCount: 2, dismissedCount: 1, rulesVersion: "ash-memo-1" });
  check("memo check counts are stored", memo.status === 201, memo.data);
  const evidence = await avery.request<{ pack: Record<string, unknown> }>("POST", "/api/ash/evidence", { operationId: payrollId, arbiterPublicKey: generateX25519().publicKey });
  check("evidence package seals", evidence.status === 201, evidence.data);
  const verified = await avery.request<{ valid: boolean }>("POST", "/api/ash/evidence/verify", { pack: evidence.data.pack });
  check("evidence package verifies", verified.data.valid === true, verified.data);
  const minted = await avery.request<{ token: string; agent: { id: string } }>("POST", "/api/ash/agents", { name: "Smoke agent", budgetZec: "0.0001", scopes: ["read", "pay"] });
  check("agent token is minted", minted.status === 201, minted.data);
  const bot = client();
  bot.useToken(minted.data.token);
  const botSession = await bot.request<{ user: { kind: string } | null }>("GET", "/api/ash/session");
  check("agent token authenticates", botSession.data.user?.kind === "agent", botSession.data);
  const revoked = await avery.request("DELETE", `/api/ash/agents/${minted.data.agent.id}`);
  const after = await bot.request("GET", "/api/ash/overview");
  check("revoked token stops working", revoked.status === 200 && after.status === 403, after.status);

  console.log("Pages");
  const cookie = (c: AshClient) => [c.cookie, `ash_mode=${mode}`].filter(Boolean).join("; ");
  const pages: [string, AshClient][] = [
    ["/", avery], ["/workspace", avery], ["/payments", avery], ["/payments/payroll", avery], [`/payments/payroll/${payrollId}`, avery],
    ["/payments/payroll/new", avery], ["/payments/tips", noor], ["/payments/tips/new", noor], [`/payments/tips/${tipId}`, guest],
    ["/payments/subscriptions", jules], ["/commerce", jules], ["/commerce/new", noor], [`/commerce/offers/${offerId}`, jules],
    [`/commerce/exchanges/${exchangeId}`, jules], ["/privacy", avery], ["/privacy/grants", avery], ["/privacy/memo", avery],
    ["/operations", avery], [`/operations/${payrollId}`, avery], ["/operations/verify", avery], ["/agents", avery], ["/settings", noor], ["/help", avery], ["/docs", avery],
  ];
  for (const [page, c] of pages) {
    const response = await fetch(`${baseUrl}${page}`, { headers: { cookie: cookie(c) } });
    check(`GET ${page}`, response.status === 200, response.status);
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});

import { utf8ToBytes } from "@noble/hashes/utils.js";
import { beforeEach, describe, expect, it } from "vitest";
import { generateX25519, openBox, sealTo } from "@/crypto/box";
import { decryptPack, encryptPack } from "@/crypto/pack";
import { proveAmountSum, verifyAmountSum } from "@/crypto/pedersen";
import { combineShares, shareFromJson, shareToJson, splitSecret } from "@/crypto/shamir";
import { AshError } from "@/domain/errors";
import { decryptEvidence, encryptEvidence, sealEvidence, verifyEvidence, type EvidenceBody } from "@/evidence/format";
import { analyzeMemo, proposeCleanup } from "@/memo/linter";
import { failNextPayment } from "@/services/common";
import { buildEvidence } from "@/services/evidence";
import {
  ackExchange,
  createOffer,
  exchangePackage,
  failDelivery,
  openExchange,
  payExchange,
  recoverExchange,
  registerKey,
  releaseExchange,
} from "@/services/exchange";
import { createGrant, getGrant, withdrawGrant } from "@/services/grants";
import { recordMemoCheck } from "@/services/memo";
import {
  authorizePayroll,
  createPayroll,
  executePayroll,
  payrollReport,
  retryPayrollLine,
} from "@/services/payroll";
import { cancelSubscription, createSubscriptionOffer, refreshSubscription, renewSubscription, subscribe } from "@/services/subscriptions";
import { checkReceipt, createTip, getReceipt, payTip } from "@/services/tips";
import { fulfillChallenge, issueChallenge, payChallenge } from "@/services/x402";
import type { Store } from "@/store/types";
import { asUser, key, SAPLING_A, SAPLING_B, useMemory } from "./helpers";

const avery = asUser("user_avery");
const noor = asUser("user_noor");
const jules = asUser("user_jules");
const sam = asUser("user_sam");
let store: Store;

beforeEach(() => {
  store = useMemory();
});

describe("payroll", () => {
  it("validates a batch, blocks completion, and retries a failed line once", async () => {
    const input = {
      name: "October",
      lines: [
        { label: "Ada", address: SAPLING_A, amountZec: "0.01" },
        { label: "Ben", address: SAPLING_B, amountZec: "0.02" },
      ],
    };
    const created = await store.transaction((tx) => createPayroll(tx, avery, input, key("payroll")));
    expect(created.operation.state).toBe("validated");
    expect(created.payroll.proof && verifyAmountSum(created.payroll.proof).valid).toBe(true);
    const replay = await store.transaction((tx) => createPayroll(tx, avery, input, key("payroll")));
    expect(replay.operation.id).toBe(created.operation.id);

    const duplicate = await store.transaction((tx) =>
      createPayroll(
        tx,
        avery,
        {
          name: "Bad",
          lines: [
            { label: "Ada", address: SAPLING_A, amountZec: "0.01" },
            { label: "", address: SAPLING_A, amountZec: "0" },
          ],
        },
        null,
      ),
    );
    expect(duplicate.operation.state).toBe("draft");
    expect(duplicate.payroll.errors.length).toBeGreaterThan(0);
    expect(duplicate.payroll.lines[0].state).toBe("ready");
    expect(duplicate.payroll.lines[1].state).toBe("invalid");

    await expect(store.transaction((tx) => authorizePayroll(tx, jules, created.operation.id, created.version))).rejects.toThrow(AshError);
    const authorized = await store.transaction((tx) => authorizePayroll(tx, avery, created.operation.id, created.version));
    failNextPayment(`${created.payroll.lines[0].id}:0`);
    const executed = await store.transaction((tx) => executePayroll(tx, avery, created.operation.id, authorized.version));
    expect(executed.operation.state).toBe("partially_completed");
    expect(executed.payroll.lines[0].state).toBe("failed");
    expect(executed.payroll.lines[1].state).toBe("verified");
    const retried = await store.transaction((tx) => retryPayrollLine(tx, avery, created.operation.id, created.payroll.lines[0].id, executed.version));
    expect(retried.operation.state).toBe("completed");
    expect(retried.payroll.lines.every((line) => line.state === "verified")).toBe(true);
    await expect(store.transaction((tx) => executePayroll(tx, avery, created.operation.id, retried.version))).rejects.toThrow(/Authorize|cannot move|invalid_state/);

    const ledgers = await store.transaction((tx) => tx.list("payment_ledger"));
    const ben = ledgers.filter((row) => row.id.startsWith(created.payroll.lines[1].id));
    expect(ben).toHaveLength(1);

    const aggregate = await store.transaction((tx) => payrollReport(tx, sam, created.operation.id, "aggregate"));
    expect(aggregate).not.toHaveProperty("lines");
    expect(aggregate.totalAmountZatoshi).toBe("3000000");
    expect(aggregate.totalFeeZatoshi).toBe("20000");
    const operator = await store.transaction((tx) => payrollReport(tx, avery, created.operation.id, "operator"));
    expect(operator).toHaveProperty("lines");
    await expect(store.transaction((tx) => payrollReport(tx, sam, created.operation.id, "operator"))).rejects.toThrow(/aggregate/);
  });

  it("does not let a stale version overwrite a run", async () => {
    const created = await store.transaction((tx) =>
      createPayroll(tx, avery, { name: "Race", lines: [{ label: "Ada", address: SAPLING_A, amountZec: "0.01" }] }, null),
    );
    const [first, second] = await Promise.allSettled([
      store.transaction((tx) => authorizePayroll(tx, avery, created.operation.id, created.version)),
      store.transaction((tx) => authorizePayroll(tx, avery, created.operation.id, created.version)),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(["fulfilled", "rejected"]);
  });
});

describe("tips and receipts", () => {
  it("issues a limited simulated receipt and rejects a tampered one", async () => {
    const page = await store.transaction((tx) =>
      createTip(tx, noor, { title: "Studio", address: SAPLING_A, suggestedZec: ["0.001"], statement: "Thanks" }, key("tip")),
    );
    const paid = await store.transaction((tx) =>
      payTip(tx, jules, page.operation.id, { amountZec: "0.001", memo: "hello", includeMemo: true }, key("tippay")),
    );
    expect(paid.receipt?.verificationLevel).toBe("simulated");
    expect(paid.receipt?.approvedFields).not.toContain("viewingKey");
    expect(Object.keys(paid.receipt ?? {})).not.toContain("viewingKey");
    const loaded = await store.transaction((tx) => getReceipt(tx, paid.receipt!.id));
    expect(checkReceipt(loaded).valid).toBe(true);
    const tampered = { ...loaded, amountZatoshi: "1" };
    expect(checkReceipt(tampered).valid).toBe(false);
    await expect(
      store.transaction((tx) => payTip(tx, jules, page.operation.id, { amountZec: "0.001", txId: "ab".repeat(32) }, key("observe"))),
    ).rejects.toThrow(/not observed|unresolved|No Zcash/);
  });
});

describe("api payments", () => {
  it("challenges, fulfills once, and rejects expiry, replay, and a bad reference", async () => {
    const issued = await store.transaction((tx) => issueChallenge(tx, "http://localhost"));
    expect(issued.status).toBe(402);
    const challengeId = issued.body.accepts[0].extra.challengeId;
    expect(await store.transaction((tx) => fulfillChallenge(tx, null, "/api/v1/paid/research"))).toBeNull();
    const paid = await store.transaction((tx) => payChallenge(tx, jules, challengeId));
    const header = Buffer.from(
      JSON.stringify({ scheme: "zcash-shielded", payload: { challengeId, paymentRef: paid.paymentRef } }),
    ).toString("base64");
    const body = await store.transaction((tx) => fulfillChallenge(tx, header, "/api/v1/paid/research"));
    expect(body?.topic).toBe("Shielded request pricing");
    await expect(store.transaction((tx) => fulfillChallenge(tx, header, "/api/v1/paid/research"))).rejects.toThrow(/already used/);
    await expect(store.transaction((tx) => fulfillChallenge(tx, header, "/api/v1/other"))).rejects.toThrow(/different request/);

    const second = await store.transaction((tx) => issueChallenge(tx, "http://localhost"));
    const otherId = second.body.accepts[0].extra.challengeId;
    const doc = await store.transaction((tx) => tx.get<{ expiresAt: string; status: string }>("challenge", otherId));
    await store.transaction((tx) => tx.put("challenge", otherId, { ...doc!.data, expiresAt: "2020-01-01T00:00:00.000Z" }, doc!.version));
    await expect(store.transaction((tx) => payChallenge(tx, jules, otherId))).rejects.toThrow(/expired/);

    const third = await store.transaction((tx) => issueChallenge(tx, "http://localhost"));
    const thirdId = third.body.accepts[0].extra.challengeId;
    const bad = Buffer.from(JSON.stringify({ scheme: "zcash-shielded", payload: { challengeId: thirdId, paymentRef: "nope" } })).toString("base64");
    await expect(store.transaction((tx) => fulfillChallenge(tx, bad, "/api/v1/paid/research"))).rejects.toThrow(/does not match|not sufficient|no verified/);
  });
});

describe("exchange and escrow prototype", () => {
  async function published() {
    const plaintext = utf8ToBytes("private dataset row");
    const encrypted = encryptPack(plaintext);
    const offer = await store.transaction((tx) =>
      createOffer(
        tx,
        noor,
        {
          title: "Notes",
          description: "A small file",
          priceZec: "0.002",
          plaintextSha256: encrypted.pack.plaintextSha256,
          pack: encrypted.pack,
        },
        key("offer"),
      ),
    );
    return { plaintext, encrypted, offerId: offer.offer.id };
  }

  it("encrypts locally, withholds the package until payment, and recovers with the mediator share", async () => {
    const { plaintext, encrypted, offerId } = await published();
    expect(Buffer.from(decryptPack(encrypted.pack, encrypted.key))).toEqual(Buffer.from(plaintext));
    expect(() => decryptPack(encrypted.pack, new Uint8Array(32).fill(7))).toThrow(/authentication/);
    const tampered = structuredClone(encrypted.pack);
    tampered.chunks[0].ciphertext = tampered.chunks[0].ciphertext.replace(/[0-9a-f]/, (char) => (char === "a" ? "b" : "a"));
    expect(() => decryptPack(tampered, encrypted.key)).toThrow(/authentication|modified|hash/);

    const buyer = generateX25519();
    const stranger = generateX25519();
    await store.transaction((tx) => registerKey(tx, jules, buyer.publicKey));
    const opened = await store.transaction((tx) => openExchange(tx, jules, offerId, key("open")));
    const shares = splitSecret(encrypted.key);
    const wrong = sealTo(stranger.publicKey, shares[0].bytes);
    expect(() => openBox(buyer.privateKey, wrong)).toThrow(/authentication/);
    await store.transaction((tx) =>
      releaseExchange(tx, noor, opened.operation.id, {
        expectedVersion: opened.version,
        buyerShareEnvelope: sealTo(buyer.publicKey, shares[0].bytes),
        releaseEnvelope: sealTo(buyer.publicKey, shares[1].bytes),
        mediatorShare: shareToJson(shares[2]),
      }),
    );
    const early = await store.transaction((tx) => exchangePackage(tx, jules, opened.operation.id));
    expect(early.paid).toBe(false);
    expect(early.pack).toBeNull();
    expect(early.buyerShareEnvelope).toBeTruthy();

    await expect(
      store.transaction((tx) => payExchange(tx, jules, opened.operation.id, { expectedVersion: opened.version + 1, txId: "cd".repeat(32) }, key("txid"))),
    ).rejects.toThrow(/not observed|unresolved|RPC/);
    const still = await store.transaction((tx) => exchangePackage(tx, jules, opened.operation.id));
    expect(still.paid).toBe(false);

    const paid = await store.transaction((tx) =>
      payExchange(tx, jules, opened.operation.id, { expectedVersion: opened.version + 1 }, key("expay")),
    );
    expect(paid.operation.state).toBe("payment_verified");
    const bundle = await store.transaction((tx) => exchangePackage(tx, jules, opened.operation.id));
    const keyBytes = combineShares([
      { index: 1, bytes: openBox(buyer.privateKey, bundle.buyerShareEnvelope!) },
      { index: 2, bytes: openBox(buyer.privateKey, bundle.releaseEnvelope!) },
    ]);
    expect(Buffer.from(decryptPack(bundle.pack!, keyBytes))).toEqual(Buffer.from(plaintext));
    const done = await store.transaction((tx) => ackExchange(tx, jules, opened.operation.id, paid.version));
    expect(done.operation.state).toBe("completed");
  });

  it("releases the mediator share only after a reported delivery failure", async () => {
    const { encrypted, offerId } = await published();
    const buyer = generateX25519();
    await store.transaction((tx) => registerKey(tx, jules, buyer.publicKey));
    const opened = await store.transaction((tx) => openExchange(tx, jules, offerId, key("open2")));
    const shares = splitSecret(encrypted.key);
    const released = await store.transaction((tx) =>
      releaseExchange(tx, noor, opened.operation.id, {
        expectedVersion: opened.version,
        buyerShareEnvelope: sealTo(buyer.publicKey, shares[0].bytes),
        releaseEnvelope: sealTo(buyer.publicKey, shares[1].bytes),
        mediatorShare: shareToJson(shares[2]),
      }),
    );
    const paid = await store.transaction((tx) => payExchange(tx, jules, opened.operation.id, { expectedVersion: released.version }, key("pay2")));
    const failed = await store.transaction((tx) => failDelivery(tx, jules, opened.operation.id, paid.version));
    expect(failed.operation.state).toBe("delivery_failed");
    const recovered = await store.transaction((tx) => recoverExchange(tx, jules, opened.operation.id));
    const restored = combineShares([
      { index: 1, bytes: openBox(buyer.privateKey, recovered.buyerShareEnvelope!) },
      shareFromJson(recovered.mediatorShare),
    ]);
    expect(Buffer.from(restored)).toEqual(Buffer.from(encrypted.key));
    await expect(store.transaction((tx) => recoverExchange(tx, noor, opened.operation.id))).rejects.toThrow(/buyer/);
  });
});

describe("audit grants", () => {
  it("describes scope honestly and does not store a viewing key", async () => {
    const expiry = new Date(Date.now() + 60_000).toISOString();
    const created = await store.transaction((tx) =>
      createGrant(tx, avery, {
        auditorId: "user_sam",
        capability: "uivk",
        scopeNote: "October contractor total only, as an application filter.",
        applicationExpiresAt: expiry,
      }),
    );
    expect(created.grant.cryptographicRevocation).toBe(false);
    expect(created.grant.stillUsableCryptographically).toBe(true);
    expect(created.grant.disclosure).toMatch(/cannot revoke|does not erase/i);
    await expect(
      store.transaction((tx) =>
        createGrant(tx, avery, {
          auditorId: "user_sam",
          capability: "filtered_report",
          scopeNote: "report",
          applicationExpiresAt: expiry,
          reportText: "uview1examplekeymaterial",
        }),
      ),
    ).rejects.toThrow(/viewing/);

    const report = await store.transaction((tx) =>
      createGrant(tx, avery, {
        auditorId: "user_sam",
        capability: "filtered_report",
        scopeNote: "One total.",
        applicationExpiresAt: expiry,
        reportText: "Total 0.03 ZEC across 2 lines.",
      }),
    );
    const seen = await store.transaction((tx) => getGrant(tx, sam, report.operation.id));
    expect(seen.grant.reportText).toContain("0.03");
    const withdrawn = await store.transaction((tx) => withdrawGrant(tx, avery, report.operation.id, report.version));
    expect(withdrawn.operation.state).toBe("cancelled");
    expect(withdrawn.grant.cryptographicRevocation).toBe(false);
    const after = await store.transaction((tx) => getGrant(tx, sam, report.operation.id));
    expect(after.grant.reportText).toBeNull();

    const clock = await store.transaction(async (tx) => {
      const doc = await tx.get<{ applicationExpiresAt: string }>("grant", created.operation.id);
      await tx.put("grant", created.operation.id, { ...doc!.data, applicationExpiresAt: "2020-01-01T00:00:00.000Z" }, doc!.version);
      return getGrant(tx, sam, created.operation.id);
    });
    expect(clock.operation.state).toBe("expired");
    expect(clock.grant.stillUsableCryptographically).toBe(true);
  });
});

describe("subscriptions", () => {
  it("extends once per payment, then grace, expiry, and cancellation behave", async () => {
    const plan = await store.transaction((tx) =>
      createSubscriptionOffer(tx, noor, { title: "Feed", description: "Notes", priceZec: "0.001", intervalDays: 30, graceDays: 3 }),
    );
    const sub = await store.transaction((tx) => subscribe(tx, jules, plan.id, key("sub")));
    const first = await store.transaction((tx) => renewSubscription(tx, jules, sub.operation.id, sub.version, key("renew"), Date.parse("2026-10-01T00:00:00.000Z")));
    const again = await store.transaction((tx) => renewSubscription(tx, jules, sub.operation.id, sub.version, key("renew"), Date.parse("2026-11-01T00:00:00.000Z")));
    expect(again.subscription.currentPeriodEnd).toBe(first.subscription.currentPeriodEnd);
    const second = await store.transaction((tx) =>
      renewSubscription(tx, jules, sub.operation.id, first.version, key("renew2"), Date.parse("2026-10-15T00:00:00.000Z")),
    );
    expect(Date.parse(second.subscription.currentPeriodEnd!)).toBeGreaterThan(Date.parse(first.subscription.currentPeriodEnd!));
    const end = Date.parse(second.subscription.currentPeriodEnd!);
    const grace = await store.transaction((tx) => refreshSubscription(tx, jules, sub.operation.id, end + 1_000));
    expect(grace.operation.state).toBe("grace");
    expect(grace.effective.entitled).toBe(true);
    const expired = await store.transaction((tx) => refreshSubscription(tx, jules, sub.operation.id, end + 4 * 24 * 60 * 60 * 1000));
    expect(expired.operation.state).toBe("expired");
    expect(expired.effective.restricted).toBe(true);
    expect(expired.subscription.customerId).toBe("user_jules");
    const cancelled = await store.transaction((tx) => cancelSubscription(tx, jules, sub.operation.id, expired.version));
    await expect(store.transaction((tx) => renewSubscription(tx, jules, sub.operation.id, cancelled.version, key("renew3")))).rejects.toThrow(/cancelled/);
  });
});

describe("memo linter", () => {
  it("flags sensitive patterns and keeps dismissed text in the proposal", () => {
    const memo = "Pay ada@example.com at 415-555-0134 invoice INV-1002 https://files.example/a?utm_source=ash sk_live_abcdefghijklmnop name: Ada Lovelace";
    const result = analyzeMemo(memo);
    const rules = new Set(result.findings.map((finding) => finding.ruleId));
    expect(rules.has("email")).toBe(true);
    expect(rules.has("phone")).toBe(true);
    expect(rules.has("invoice")).toBe(true);
    expect(rules.has("url-tracker")).toBe(true);
    expect(rules.has("credential")).toBe(true);
    expect(rules.has("named-party")).toBe(true);
    const name = result.findings.find((finding) => finding.ruleId === "named-party");
    const proposal = proposeCleanup(memo, result.findings, name ? [name.id] : []);
    expect(proposal.proposal).toContain("Ada Lovelace");
    expect(proposal.proposal).toContain("[removed:email]");
    expect(memo).toContain("ada@example.com");
    expect(result.disclaimer).toMatch(/does not make a shielded memo private/);
  });

  it("records counts without memo text", async () => {
    const saved = await store.transaction((tx) => recordMemoCheck(tx, noor, { findingCount: 2, dismissedCount: 1, rulesVersion: "ash-memo-1" }));
    const doc = await store.transaction((tx) => tx.get<Record<string, unknown>>("memo_check", saved.operation.id));
    expect(doc?.data.memoStored).toBe(false);
    expect(JSON.stringify(doc?.data)).not.toMatch(/@/);
  });
});

describe("evidence and proofs", () => {
  it("verifies a sealed package and rejects tampering, missing fields, and verified claims", async () => {
    const created = await store.transaction((tx) =>
      createPayroll(tx, avery, { name: "Evidence", lines: [{ label: "Ada", address: SAPLING_A, amountZec: "0.01" }] }, null),
    );
    const evidence = await store.transaction((tx) => buildEvidence(tx, avery, created.operation.id));
    expect(verifyEvidence(evidence.pack).valid).toBe(true);
    expect(evidence.pack.independentlyVerified).toBe(false);
    const tampered = structuredClone(evidence.pack);
    tampered.facts[0].value = "completed";
    expect(verifyEvidence(tampered).valid).toBe(false);
    const missing = structuredClone(evidence.pack);
    // @ts-expect-error testing a malformed package
    delete missing.operationId;
    expect(verifyEvidence(missing).valid).toBe(false);
    const body: EvidenceBody = { ...evidence.pack, independentlyVerified: false, claims: [{ id: "c", suppliedBy: "user", statement: "paid", verified: false }] };
    expect(() =>
      sealEvidence("secret", { ...body, independentlyVerified: true } as unknown as EvidenceBody),
    ).toThrow(/independently/);
    const arbiter = generateX25519();
    const sealed = encryptEvidence(evidence.pack, arbiter.publicKey);
    expect(decryptEvidence(sealed, arbiter.privateKey).operationId).toBe(created.operation.id);
    expect(() => decryptEvidence(sealed, generateX25519().privateKey)).toThrow(/authentication/);

    const proof = proveAmountSum([100n, 250n], "ash-test");
    expect(verifyAmountSum(proof).valid).toBe(true);
    expect(verifyAmountSum({ ...proof, totalZatoshi: "999" }).valid).toBe(false);
    expect(proof.doesNotProve).toMatch(/not a Zcash/);
  });
});

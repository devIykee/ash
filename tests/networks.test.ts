import { bech32 } from "bech32";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateX25519, sealTo } from "@/crypto/box";
import { encryptPack } from "@/crypto/pack";
import { shareToJson, splitSecret } from "@/crypto/shamir";
import { AshError } from "@/domain/errors";
import { resolveActor } from "@/server/actor";
import { config, payToStatus } from "@/server/config";
import { createAgentToken } from "@/services/agents";
import { createOffer, exchangePackage, openExchange, payExchange, registerKey, releaseExchange } from "@/services/exchange";
import { authorizePayroll, createPayroll, executePayroll, recordPayrollLine } from "@/services/payroll";
import { createSubscriptionOffer, renewSubscription, subscribe } from "@/services/subscriptions";
import { createTip, payTip } from "@/services/tips";
import { issueChallenge, payChallenge } from "@/services/x402";
import type { Store } from "@/store/types";
import { asUser, key, SAPLING_A, SAPLING_B, useMemory } from "./helpers";

const avery = asUser("user_avery");
const noor = asUser("user_noor");
const jules = asUser("user_jules");
const KNOWN_TX = "ab".repeat(32);
const UNKNOWN_TX = "cd".repeat(32);

// Structurally valid mainnet Sapling addresses. Not wallets.
function mainnetAddress(seed: number): string {
  const bytes = new Uint8Array(43).map((_, index) => (index * 31 + seed) & 255);
  return bech32.encode("zs", bech32.toWords(bytes), 512);
}

function mockNode() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { params: [string] };
      const found = body.params[0] === KNOWN_TX;
      return new Response(JSON.stringify(found ? { result: { confirmations: 9 }, error: null } : { result: null, error: { message: "No such transaction." } }), {
        status: 200,
      });
    }),
  );
}

let store: Store;

beforeEach(() => {
  store = useMemory();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("network configuration", () => {
  it("never falls back to the testnet fixture on mainnet", async () => {
    vi.stubEnv("ASH_ZCASH_NETWORK", "mainnet");
    expect(config().payTo).toBe("");
    const status = payToStatus();
    expect(status.ok).toBe(false);
    await expect(store.transaction((tx) => issueChallenge(tx, "http://ash.local"))).rejects.toMatchObject({ code: "not_configured", status: 503 });
  });

  it("accepts mixed-case network names", () => {
    vi.stubEnv("ASH_ZCASH_NETWORK", " Mainnet ");
    expect(config().network).toBe("mainnet");
  });

  it("rejects a pay-to address for the other network", () => {
    vi.stubEnv("ASH_PAY_TO", mainnetAddress(1));
    expect(payToStatus().ok).toBe(false);
  });

  it("issues mainnet challenges and checks mainnet addresses", async () => {
    vi.stubEnv("ASH_ZCASH_NETWORK", "mainnet");
    vi.stubEnv("ASH_PAY_TO", mainnetAddress(1));
    const challenge = await store.transaction((tx) => issueChallenge(tx, "http://ash.local"));
    expect(challenge.body.accepts[0].network).toBe("zcash:mainnet");
    const good = await store.transaction((tx) =>
      createPayroll(tx, avery, { name: "Main", lines: [{ label: "Ada", address: mainnetAddress(2), amountZec: "0.01" }] }, key("main-ok")),
    );
    expect(good.operation.state).toBe("validated");
    const wrong = await store.transaction((tx) =>
      createPayroll(tx, avery, { name: "Test", lines: [{ label: "Ada", address: SAPLING_A, amountZec: "0.01" }] }, key("main-bad")),
    );
    expect(wrong.payroll.errors[0].message).toMatch(/testnet, not mainnet/);
  });
});

describe("wallet-payment (chain) mode", () => {
  beforeEach(() => {
    vi.stubEnv("ASH_PAYMENT_MODE", "chain");
    vi.stubEnv("ZCASH_RPC_URL", "http://node.local");
    mockNode();
  });

  it("records an observed tip without issuing a receipt", async () => {
    const tip = await store.transaction((tx) => createTip(tx, noor, { title: "Jar", address: SAPLING_A, suggestedZec: ["0.001"], statement: "" }, key("tip")));
    const id = tip.operation.id;
    await expect(store.transaction((tx) => payTip(tx, null, id, { amountZec: "0.001" }, null))).rejects.toMatchObject({ code: "txid_required" });
    const seen = await store.transaction((tx) => payTip(tx, null, id, { amountZec: "0.001", txId: KNOWN_TX }, key("tip-seen")));
    expect(seen.payment.status).toBe("observed");
    expect(seen.receipt).toBeNull();
    await expect(store.transaction((tx) => payTip(tx, null, id, { amountZec: "0.001", txId: UNKNOWN_TX }, key("tip-missing")))).rejects.toMatchObject({
      code: "payment_unverified",
    });
  });

  it("keeps a file locked after an observed payment", async () => {
    const encrypted = encryptPack(new TextEncoder().encode("locked"));
    await expect(
      store.transaction((tx) =>
        createOffer(tx, noor, { title: "F", description: "", priceZec: "0.01", plaintextSha256: encrypted.pack.plaintextSha256, pack: encrypted.pack }, key("offer-nopay")),
      ),
    ).rejects.toThrow(/receives the buyer's payment/);
    const offer = await store.transaction((tx) =>
      createOffer(tx, noor, { title: "F", description: "", priceZec: "0.01", payTo: SAPLING_B, plaintextSha256: encrypted.pack.plaintextSha256, pack: encrypted.pack }, key("offer")),
    );
    expect(offer.offer.walletUri).toMatch(/^zcash:ztestsapling1/);
    const device = generateX25519();
    await store.transaction((tx) => registerKey(tx, jules, device.publicKey));
    const opened = await store.transaction((tx) => openExchange(tx, jules, offer.offer.id, key("ex")));
    const shares = splitSecret(encrypted.key);
    const released = await store.transaction((tx) =>
      releaseExchange(tx, noor, opened.operation.id, {
        expectedVersion: opened.version,
        buyerShareEnvelope: sealTo(device.publicKey, shares[0].bytes),
        releaseEnvelope: sealTo(device.publicKey, shares[1].bytes),
        mediatorShare: shareToJson(shares[2]) as { index: number; bytes: string },
      }),
    );
    const paid = await store.transaction((tx) => payExchange(tx, jules, opened.operation.id, { expectedVersion: released.version, txId: KNOWN_TX }, key("ex-pay")));
    expect(paid.operation.state).toBe("payment_observed");
    const bundle = await store.transaction((tx) => exchangePackage(tx, jules, opened.operation.id));
    expect(bundle.paid).toBe(false);
    expect(bundle.releaseEnvelope).toBeNull();
  });

  it("does not extend a subscription on observation", async () => {
    const plan = await store.transaction((tx) =>
      createSubscriptionOffer(tx, noor, { title: "Feed", description: "", priceZec: "0.001", intervalDays: 30, graceDays: 3, payTo: SAPLING_A }),
    );
    const sub = await store.transaction((tx) => subscribe(tx, jules, plan.id, key("sub")));
    await expect(store.transaction((tx) => renewSubscription(tx, jules, sub.operation.id, sub.version, null))).rejects.toMatchObject({ code: "txid_required" });
    const renewed = await store.transaction((tx) => renewSubscription(tx, jules, sub.operation.id, sub.version, key("renew"), Date.now(), KNOWN_TX));
    expect(renewed.operation.state).toBe("payment_observed");
    expect(renewed.effective.entitled).toBe(false);
    expect(renewed.subscription.currentPeriodEnd).toBeNull();
  });

  it("records payroll lines from wallet transaction ids", async () => {
    const created = await store.transaction((tx) =>
      createPayroll(
        tx,
        avery,
        {
          name: "Wallet run",
          lines: [
            { label: "Ada", address: SAPLING_A, amountZec: "0.01" },
            { label: "Ben", address: SAPLING_B, amountZec: "0.02" },
          ],
        },
        key("wallet-run"),
      ),
    );
    const authorized = await store.transaction((tx) => authorizePayroll(tx, avery, created.operation.id, created.version));
    await expect(store.transaction((tx) => executePayroll(tx, avery, created.operation.id, authorized.version))).rejects.toMatchObject({ code: "txid_required" });
    const line = authorized.payroll.lines[0];
    const recorded = await store.transaction((tx) => recordPayrollLine(tx, avery, created.operation.id, line.id, authorized.version, KNOWN_TX));
    expect(recorded.payroll.lines[0].state).toBe("observed");
    expect(recorded.payroll.lines[1].state).toBe("ready");
    expect(recorded.operation.state).toBe("partially_completed");
    const missing = await store.transaction((tx) =>
      recordPayrollLine(tx, avery, created.operation.id, recorded.payroll.lines[1].id, recorded.version, UNKNOWN_TX),
    );
    expect(missing.payroll.lines[1].state).toBe("failed");
  });

  it("gives no payment reference for an observed API payment", async () => {
    const challenge = await store.transaction((tx) => issueChallenge(tx, "http://ash.local"));
    const id = challenge.body.accepts[0].extra.challengeId;
    await expect(store.transaction((tx) => payChallenge(tx, jules, id))).rejects.toMatchObject({ code: "txid_required" });
    const paid = await store.transaction((tx) => payChallenge(tx, jules, id, { txId: KNOWN_TX }));
    expect(paid.paymentRef).toBeNull();
    expect(paid.status).toBe("observed");
  });
});

describe("store and auth paths", () => {
  it("refuses writes through the read-only view", async () => {
    await store.transaction(async () => undefined);
    await expect(store.read((tx) => tx.put("x", "y", {}, null))).rejects.toBeInstanceOf(AshError);
    const users = await store.read((tx) => tx.list("user"));
    expect(users.length).toBe(4);
  });

  it("finds an agent token through the hash index", async () => {
    const minted = await store.transaction((tx) => createAgentToken(tx, avery, { name: "Bot", budgetZec: "0.01", scopes: ["read"] }));
    const req = new Request("http://ash.local/api/ash/session", { headers: { authorization: `Bearer ${minted.token}` } });
    const actor = await store.transaction((tx) => resolveActor(tx, req));
    expect(actor?.kind).toBe("agent");
    const forged = new Request("http://ash.local/api/ash/session", { headers: { authorization: `Bearer ash_00000000_${"0".repeat(64)}` } });
    await expect(store.transaction((tx) => resolveActor(tx, forged))).rejects.toMatchObject({ status: 401 });
  });
});

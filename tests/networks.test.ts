import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateX25519, sealTo } from "@/crypto/box";
import { encryptPack } from "@/crypto/pack";
import { shareToJson, splitSecret } from "@/crypto/shamir";
import type { Mode } from "@/domain/types";
import { config } from "@/server/config";
import { withMode } from "@/server/mode";
import { createOffer, exchangePackage, openExchange, payExchange, registerKey, releaseExchange } from "@/services/exchange";
import { listOperations } from "@/services/overview";
import { checkPaymentRequest, type PublicRequest } from "@/services/payment-requests";
import { authorizePayroll, createPayroll, executePayroll, verifyPayrollTransaction } from "@/services/payroll";
import { createSubscriptionOffer, renewSubscription, subscribe } from "@/services/subscriptions";
import { createTip, getReceipt, payTip } from "@/services/tips";
import { saveWalletKey } from "@/services/wallet-keys";
import { checkChallengePayment, fulfillChallenge, issueChallenge } from "@/services/x402";
import type { Store } from "@/store/types";
import { asUser, key, SAPLING_A, useMemory } from "./helpers";
import { FakeChain, makeWallet, payment, type TestWallet } from "./zcash-fixtures";

const chain = vi.hoisted(() => ({ current: null as null | { mock: () => Record<string, unknown> } }));
vi.mock("@/zcash/lightwalletd", async () => {
  const { FakeChain: Chain } = await import("./zcash-fixtures");
  const instance = new Chain();
  chain.current = instance;
  const api = instance.mock();
  return api;
});
const fake = () => chain.current as unknown as FakeChain;

const avery = asUser("user_avery");
const noor = asUser("user_noor");
const jules = asUser("user_jules");

let store: Store;
let noorWallet: TestWallet;
let averyWallet: TestWallet;

function inMode<T>(mode: Mode, fn: () => Promise<T>): Promise<T> {
  return withMode(mode, fn);
}

async function registerKeys(mode: Mode) {
  const network = mode === "mainnet" ? "mainnet" : "testnet";
  noorWallet = makeWallet(network);
  averyWallet = makeWallet(network);
  await inMode(mode, () => store.transaction((tx) => saveWalletKey(tx, noor, { network, address: noorWallet.address, viewingKey: noorWallet.viewingKey })));
  await inMode(mode, () => store.transaction((tx) => saveWalletKey(tx, avery, { network, address: averyWallet.address, viewingKey: averyWallet.viewingKey })));
}

beforeEach(() => {
  store = useMemory();
  fake().txs.clear();
  fake().tip = 1000;
});

describe("modes", () => {
  it("derives network, payment mode, and confirmations from the mode", () => {
    expect(config("practice")).toMatchObject({ network: "testnet", allowSimulated: true, paymentMode: "simulated" });
    expect(config("testnet")).toMatchObject({ network: "testnet", allowSimulated: false, paymentMode: "chain", requiredConfirmations: 1 });
    expect(config("mainnet")).toMatchObject({ network: "mainnet", allowSimulated: false, requiredConfirmations: 3 });
  });

  it("keeps each mode's records apart", async () => {
    await inMode("practice", () =>
      store.transaction((tx) => createPayroll(tx, avery, { name: "Practice run", lines: [{ label: "Ada", address: SAPLING_A, amountZec: "0.01" }] }, key("p-run"))),
    );
    const practice = await inMode("practice", () => store.read((tx) => listOperations(tx, avery)));
    const testnet = await inMode("testnet", () => store.read((tx) => listOperations(tx, avery)));
    expect(practice.map((item) => item.label)).toContain("Practice run");
    expect(testnet).toHaveLength(0);
  });
});

describe("receiving keys", () => {
  it("accepts a matching address and key, and rejects mismatches and spending keys", async () => {
    const wallet = makeWallet("testnet");
    const other = makeWallet("testnet");
    const saved = await store.transaction((tx) => saveWalletKey(tx, noor, { network: "testnet", address: wallet.address, viewingKey: wallet.viewingKey }));
    expect(saved.saplingAddress).toBe(wallet.address);
    expect(saved.canVerifyOutgoing).toBe(true);
    expect(JSON.stringify(saved)).not.toContain(wallet.viewingKey);
    await expect(store.transaction((tx) => saveWalletKey(tx, noor, { network: "testnet", address: wallet.address, viewingKey: other.viewingKey }))).rejects.toThrow(/does not belong/);
    await expect(store.transaction((tx) => saveWalletKey(tx, noor, { network: "mainnet", address: wallet.address, viewingKey: wallet.viewingKey }))).rejects.toThrow(/testnet, not mainnet/);
    await expect(
      store.transaction((tx) => saveWalletKey(tx, noor, { network: "testnet", address: wallet.address, viewingKey: "secret-extended-key-test1qqqqqqqqqqqqqqqqqqqq" })),
    ).rejects.toThrow(/spending key/);
  });
});

describe.each(["testnet", "mainnet"] as const)("real payments on %s", (mode) => {
  beforeEach(async () => {
    await registerKeys(mode);
  });

  async function confirmRequest(request: PublicRequest, to: TestWallet, value = BigInt(request.amountZatoshi), memo = request.memo) {
    fake().add([payment(to.sapling, value, memo)]);
    fake().mine(config(mode).requiredConfirmations - 1);
    return inMode(mode, () => checkPaymentRequest(request.ref));
  }

  it("issues a tip receipt only after a matching payment confirms", async () => {
    await expect(
      inMode(mode, () => store.transaction((tx) => createTip(tx, jules, { title: "No key", address: "", suggestedZec: ["0.001"], statement: "" }, key("nokey")))),
    ).rejects.toThrow();
    const tip = await inMode(mode, () => store.transaction((tx) => createTip(tx, noor, { title: "Jar", address: "ignored", suggestedZec: ["0.001"], statement: "" }, key("tip"))));
    expect(tip.tip.address).toBe(noorWallet.address);
    const started = await inMode("practice", () => store.transaction((tx) => payTip(tx, null, tip.operation.id, { amountZec: "0.001", memo: "thanks", includeMemo: true }, key("tip-pay"))));
    const request = started.request!;
    expect(request.network).toBe(mode);
    expect(request.uri.startsWith("zcash:")).toBe(true);
    expect(request.uri).toContain("memo=");

    const waiting = await inMode(mode, () => checkPaymentRequest(request.ref));
    expect(waiting.status).toBe("open");

    // Wrong memo and short amount never satisfy the request.
    fake().add([payment(noorWallet.sapling, 100_000n, "ASH WRONGREF00")]);
    fake().add([payment(noorWallet.sapling, 10n, request.memo)]);
    expect((await inMode(mode, () => checkPaymentRequest(request.ref))).status).toBe("open");

    const done = await confirmRequest(request, noorWallet);
    expect(done.status).toBe("confirmed");
    const receipt = await store.read((tx) => getReceipt(tx, done.resultRef!));
    expect(receipt.verificationLevel).toBe("confirmed");
    expect(receipt.memo).toBe("thanks");
    expect(receipt.network).toBe(mode);
  });

  it("keeps the file locked until the payment has enough confirmations, then unlocks it", async () => {
    const encrypted = encryptPack(new TextEncoder().encode("file"));
    const offer = await inMode(mode, () =>
      store.transaction((tx) => createOffer(tx, noor, { title: "F", description: "", priceZec: "0.01", plaintextSha256: encrypted.pack.plaintextSha256, pack: encrypted.pack }, key("offer"))),
    );
    expect(offer.offer.payTo).toBe(noorWallet.address);
    const device = generateX25519();
    await inMode(mode, () => store.transaction((tx) => registerKey(tx, jules, device.publicKey)));
    const opened = await inMode(mode, () => store.transaction((tx) => openExchange(tx, jules, offer.offer.id, key("ex"))));
    const shares = splitSecret(encrypted.key);
    const released = await inMode(mode, () =>
      store.transaction((tx) =>
        releaseExchange(tx, noor, opened.operation.id, {
          expectedVersion: opened.version,
          buyerShareEnvelope: sealTo(device.publicKey, shares[0].bytes),
          releaseEnvelope: sealTo(device.publicKey, shares[1].bytes),
          mediatorShare: shareToJson(shares[2]) as { index: number; bytes: string },
        }),
      ),
    );
    const paying = await inMode(mode, () => store.transaction((tx) => payExchange(tx, jules, opened.operation.id, { expectedVersion: released.version }, key("pay"))));
    const request = paying.request!;
    const txid = fake().add([payment(noorWallet.sapling, 1_000_000n, request.memo)], false);
    const mempool = await inMode(mode, () => checkPaymentRequest(request.ref, txid));
    expect(mempool.status).toBe("confirming");
    expect((await store.read((tx) => exchangePackage(tx, jules, opened.operation.id))).paid).toBe(false);
    fake().txs.get([...txid.match(/../g)!].reverse().join(""))!.height = fake().tip + 1;
    fake().mine(config(mode).requiredConfirmations);
    const confirmed = await inMode(mode, () => checkPaymentRequest(request.ref));
    expect(confirmed.status).toBe("confirmed");
    const bundle = await store.read((tx) => exchangePackage(tx, jules, opened.operation.id));
    expect(bundle.paid).toBe(true);
    expect(bundle.releaseEnvelope).toBeTruthy();
  });

  it("refuses to use one on-chain payment for two requests", async () => {
    const plan = await inMode(mode, () => store.transaction((tx) => createSubscriptionOffer(tx, noor, { title: "Feed", description: "", priceZec: "0.001", intervalDays: 30, graceDays: 3 })));
    const first = await inMode(mode, () => store.transaction((tx) => subscribe(tx, jules, plan.id, key("sub1"))));
    const renewal = await inMode(mode, () => store.transaction((tx) => renewSubscription(tx, jules, first.operation.id, first.version, key("renew1"))));
    const request = renewal.request!;
    const txid = fake().add([payment(noorWallet.sapling, 100_000n, request.memo)]);
    fake().mine(3);
    const done = await inMode(mode, () => checkPaymentRequest(request.ref, txid));
    expect(done.status).toBe("confirmed");
    const second = await inMode(mode, () => store.transaction((tx) => subscribe(tx, jules, plan.id, key("sub2"))));
    const other = await inMode(mode, () => store.transaction((tx) => renewSubscription(tx, jules, second.operation.id, second.version, key("renew2"))));
    const reused = await inMode(mode, () => checkPaymentRequest(other.request!.ref, txid));
    expect(reused.status).toBe("open");
  });

  it("serves the paid API once after a confirmed payment", async () => {
    const challenge = await inMode(mode, () => store.transaction((tx) => issueChallenge(tx, "http://ash.local")));
    const accept = challenge.body.accepts[0];
    expect(accept.network).toBe(`zcash:${mode}`);
    expect(accept.payTo).toBe(averyWallet.address);
    const ref = accept.extra.paymentRequestRef!;
    const read = <T,>(fn: (tx: Parameters<Parameters<Store["read"]>[0]>[0]) => Promise<T>) => store.read(fn);
    const before = await inMode(mode, () => checkChallengePayment(read, accept.extra.challengeId));
    expect(before.paymentRef).toBeNull();
    fake().add([payment(averyWallet.sapling, 100_000n, accept.extra.memo!)]);
    fake().mine(3);
    const paid = await inMode(mode, () => checkChallengePayment(read, accept.extra.challengeId));
    expect(paid.paymentRef).toBe(ref);
    const header = Buffer.from(JSON.stringify({ scheme: "zcash-shielded", payload: { challengeId: accept.extra.challengeId, paymentRef: ref } })).toString("base64");
    const served = await inMode(mode, () => store.transaction((tx) => fulfillChallenge(tx, header, "/api/v1/paid/research")));
    expect(served?.text).toBeTruthy();
    await expect(inMode(mode, () => store.transaction((tx) => fulfillChallenge(tx, header, "/api/v1/paid/research")))).rejects.toThrow(/already used/);
  });

  it("confirms payroll lines from the operator's outgoing notes", async () => {
    const ada = makeWallet(mode === "mainnet" ? "mainnet" : "testnet");
    const ben = makeWallet(mode === "mainnet" ? "mainnet" : "testnet");
    const created = await inMode(mode, () =>
      store.transaction((tx) =>
        createPayroll(tx, avery, { name: "Real run", lines: [{ label: "Ada", address: ada.address, amountZec: "0.01" }, { label: "Ben", address: ben.address, amountZec: "0.02" }] }, key("run")),
      ),
    );
    const authorized = await inMode(mode, () => store.transaction((tx) => authorizePayroll(tx, avery, created.operation.id, created.version)));
    await expect(inMode(mode, () => store.transaction((tx) => executePayroll(tx, avery, created.operation.id, authorized.version)))).rejects.toThrow();
    // Ada is paid from Avery's wallet. A payment from someone else's wallet does not count.
    const stranger = makeWallet(mode === "mainnet" ? "mainnet" : "testnet");
    const txid = fake().add([payment(ada.sapling, 1_000_000n, "payroll", averyWallet.ovk), payment(ben.sapling, 2_000_000n, "payroll", stranger.ovk)]);
    fake().mine(3);
    const result = await inMode(mode, () => verifyPayrollTransaction(avery, created.operation.id, txid));
    expect(result.matched).toBe(1);
    expect(result.payroll.lines[0].state).toBe("verified");
    expect(result.payroll.lines[1].state).toBe("ready");
    expect(result.operation.state).toBe("partially_completed");
    const second = fake().add([payment(ben.sapling, 2_000_000n, "payroll", averyWallet.ovk)]);
    fake().mine(3);
    const finished = await inMode(mode, () => verifyPayrollTransaction(avery, created.operation.id, second));
    expect(finished.operation.state).toBe("completed");
  });
});

describe("practice guard", () => {
  it("never records a practice payment in testnet or mainnet", async () => {
    const { settleSimulated } = await import("@/services/common");
    for (const mode of ["testnet", "mainnet"] as const) {
      await expect(
        inMode(mode, () => store.transaction((tx) => settleSimulated(tx, jules, { idempotencyKey: `guard-${mode}`, amountZatoshi: "1", feeZatoshi: "0" }))),
      ).rejects.toThrow(/Simulated payments are disabled/);
    }
  });
});

describe("malformed chain data", () => {
  it("treats an unreadable transaction as no payment", async () => {
    const { checkTransaction } = await import("@/zcash/verify");
    const wallet = makeWallet("testnet");
    const raw = new Uint8Array([0x05, 0, 0, 0x80, 1, 2, 3]);
    const txidBytes = new Uint8Array(32).fill(7);
    fake().txs.set(Buffer.from(txidBytes).toString("hex"), { data: raw, height: fake().tip, outputs: [] });
    const result = await checkTransaction("https://test.invalid", Buffer.from(txidBytes).reverse().toString("hex"), { ivk: wallet.ivk, address: wallet.sapling, minZatoshi: 1n, memoRef: "X" });
    expect(result.status).toBe("mismatch");
  });
});

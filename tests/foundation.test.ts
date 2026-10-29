import { describe, expect, it } from "vitest";
import { canonicalJson } from "@/domain/canonical";
import { AshError } from "@/domain/errors";
import { assertTransition } from "@/domain/machine";
import { addZatoshi, parseZatoshi, zatoshiToZec, zecToZatoshi } from "@/domain/money";
import { paymentSatisfies } from "@/domain/payment";
import { verifyEventChain } from "@/evidence/format";
import { appendEvent, createOperation } from "@/services/events";
import { assertShieldedDestination, inspectAddress } from "@/zcash/address";
import { buildZip321, parseZip321 } from "@/zcash/zip321";
import { asUser, SAPLING_A, SAPLING_B, useMemory } from "./helpers";

describe("money and addresses", () => {
  it("keeps ZEC amounts in integer zatoshi", () => {
    expect(zecToZatoshi("0.00000001")).toBe(1n);
    expect(zecToZatoshi("1.5")).toBe(150_000_000n);
    expect(zatoshiToZec(150_000_000n)).toBe("1.5");
    expect(addZatoshi([1n, 2n])).toBe(3n);
    expect(() => zecToZatoshi("1e-2")).toThrow(AshError);
    expect(() => zecToZatoshi("1.123456789")).toThrow(AshError);
    expect(() => parseZatoshi("1.0")).toThrow(AshError);
  });

  it("accepts structural shielded addresses and rejects transparent ones", () => {
    expect(inspectAddress(SAPLING_A, "testnet").kind).toBe("sapling");
    expect(inspectAddress(SAPLING_B, "testnet").memoCapable).toBe(true);
    expect(assertShieldedDestination(SAPLING_A, "testnet").shielded).toBe(true);
    expect(() => inspectAddress("zcSomething", "testnet")).toThrow(/Sprout/);
    expect(() => assertShieldedDestination("tmF7NP7cV5q1k2Q2n3p4r5s6t7u8v9", "testnet")).toThrow(AshError);
  });

  it("round-trips a ZIP-321 shielded request", () => {
    const uri = buildZip321(
      [{ address: SAPLING_B, amountZatoshi: zecToZatoshi("0.001"), memo: "This is a simple memo.", label: "ASH tip" }],
      "testnet",
    );
    expect(uri.startsWith(`zcash:${SAPLING_B}?`)).toBe(true);
    const [payment] = parseZip321(uri, "testnet");
    expect(payment.amountZatoshi).toBe(100_000n);
    expect(payment.memoText).toBe("This is a simple memo.");
    expect(payment.label).toBe("ASH tip");
    expect(() => buildZip321([{ address: SAPLING_A, amountZatoshi: 1n, memo: "x".repeat(513) }])).toThrow(/512/);
  });
});

describe("operation lifecycle", () => {
  it("rejects transitions that skip a required step", () => {
    expect(() => assertTransition("payroll_run", "draft", "completed")).toThrow(/cannot move/);
    expect(() => assertTransition("data_exchange", "awaiting_seller", "delivered")).toThrow(AshError);
    expect(() => assertTransition("api_request", "awaiting_payment", "completed")).toThrow(AshError);
    expect(() => assertTransition("subscription", "cancelled", "completed")).toThrow(AshError);
    assertTransition("tip", "payment_verified", "payment_verified");
  });

  it("keeps secrets out of the event chain", async () => {
    const store = useMemory();
    await store.transaction(async (tx) => {
      const created = await createOperation(tx, {
        id: "op_secretcheck",
        type: "memo_check",
        state: "draft",
        initiatorId: "user_avery",
        participantIds: ["user_avery"],
        label: "secret check",
        parentId: null,
        payment: null,
        access: null,
      });
      await expect(appendEvent(tx, created.data.id, "note", "draft", "draft", null, "uview1notakey")).rejects.toThrow(/viewing/);
      const events = await tx.events(created.data.id);
      expect(verifyEventChain(events)).toBe(true);
      expect(canonicalJson(events)).not.toMatch(/uview1|uivk1|seedPhrase/);
    });
    expect(asUser("user_avery").user.role).toBe("operator");
  });
});

describe("payment policy", () => {
  it("accepts only a verified simulated payment or a confirmed chain payment", () => {
    const base = {
      mode: "simulated" as const,
      amountZatoshi: "1",
      feeZatoshi: "0",
      network: "testnet" as const,
      txId: null,
      idempotencyKey: "k",
      confirmations: null,
      requiredConfirmations: 3,
      reason: null,
    };
    expect(paymentSatisfies({ ...base, status: "verified" }, true)).toBe(true);
    // Simulated payments can only be created in practice mode (settleSimulated refuses otherwise),
    // so the guard lives at creation. A seen-but-unconfirmed chain payment never satisfies.
    expect(paymentSatisfies({ ...base, mode: "chain_verified", status: "observed", confirmations: 1 })).toBe(false);
    expect(paymentSatisfies({ ...base, mode: "chain_verified", status: "confirmed", confirmations: 2 })).toBe(false);
    expect(paymentSatisfies({ ...base, mode: "chain_verified", status: "confirmed", confirmations: 3 })).toBe(true);
    expect(paymentSatisfies({ ...base, status: "observed" }, true)).toBe(false);
    expect(
      paymentSatisfies(
        { ...base, mode: "chain_observation", status: "observed", confirmations: 12 },
        true,
      ),
    ).toBe(false);
    expect(
      paymentSatisfies(
        { ...base, mode: "chain_observation", status: "confirmed", confirmations: 3 },
        false,
      ),
    ).toBe(true);
  });
});

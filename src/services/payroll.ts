import { AshError } from "@/domain/errors";
import { newId } from "@/domain/ids";
import { ESTIMATED_FEE_ZATOSHI, zecToZatoshi } from "@/domain/money";
import { paymentSatisfies } from "@/domain/payment";
import { DISCLOSURES, type OperationRecord, type OperationState } from "@/domain/types";
import { proveAmountSum, verifyAmountSum, type SumProof } from "@/crypto/pedersen";
import { config } from "@/server/config";
import { assertShieldedDestination } from "@/zcash/address";
import type { Tx } from "@/store/types";
import { assertParticipant, assertPerson, assertRole, assertScope, idempotent, mustGet, requestHash, settleSimulated, type Actor } from "./common";
import { createOperation, saveOperation } from "./events";
import { verifyingKey } from "./wallet-keys";
import { getStore } from "@/server/store";
import { currentMode, recordMode, withMode } from "@/server/mode";
import { LightwalletdError } from "@/zcash/lightwalletd";
import { saplingReceiver } from "@/zcash/unified";
import { checkOutgoing } from "@/zcash/verify";

export type PayrollLine = {
  id: string;
  label: string;
  address: string;
  addressKind: string;
  amountZatoshi: string;
  feeZatoshi: string;
  state: "invalid" | "ready" | "verified" | "failed" | "cancelled" | "observed";
  attempt: number;
  error: string | null;
  txId: string | null;
  paymentMode: string | null;
  commitment: string | null;
};

export type PayrollData = {
  operationId: string;
  network: "mainnet" | "testnet";
  lines: PayrollLine[];
  errors: { index: number; message: string }[];
  proof: SumProof | null;
};

type LineInput = { label: string; address: string; amountZec: string };

function deriveState(lines: PayrollLine[]): OperationState {
  const active = lines.filter((line) => line.state !== "cancelled");
  if (active.length === 0) return "cancelled";
  if (active.some((line) => line.state === "invalid")) return "failed";
  if (active.every((line) => line.state === "verified")) return "completed";
  if (active.some((line) => line.state === "verified" || line.state === "observed")) return "partially_completed";
  return "failed";
}

function assertCompletable(lines: PayrollLine[], state: OperationState): void {
  if (state !== "completed") return;
  const unresolved = lines.filter((line) => line.state !== "verified" && line.state !== "cancelled");
  if (unresolved.length > 0) {
    throw new AshError("invalid_state", "A payroll run cannot be completed while a line is unresolved.", 409);
  }
}

export async function createPayroll(
  tx: Tx,
  actor: Actor,
  input: { name: string; lines: LineInput[] },
  idempotencyKey: string | null,
): Promise<{ version: number; operation: OperationRecord; payroll: PayrollData }> {
  assertScope(actor, "payroll");
  assertPerson(actor);
  assertRole(actor, ["operator"]);
  return idempotent(tx, `payroll-create:${actor.user.id}`, idempotencyKey, requestHash(input), async () => {
    const cfg = config();
    if (input.lines.length === 0) throw new AshError("validation_failed", "Add at least one recipient.");
    if (input.lines.length > 100) throw new AshError("validation_failed", "A run is limited to 100 recipients.");
    const errors: PayrollData["errors"] = [];
    const seen = new Set<string>();
    const lines: PayrollLine[] = input.lines.map((line, index) => {
      const base: PayrollLine = {
        id: newId("line"),
        label: line.label.trim(),
        address: line.address.trim(),
        addressKind: "unknown",
        amountZatoshi: "0",
        feeZatoshi: ESTIMATED_FEE_ZATOSHI.toString(),
        state: "invalid",
        attempt: 0,
        error: null,
        txId: null,
        paymentMode: null,
        commitment: null,
      };
      if (!base.label) errors.push({ index, message: "Recipient label is required." });
      try {
        const amount = zecToZatoshi(line.amountZec);
        if (amount <= 0n) errors.push({ index, message: "Amount must be greater than zero." });
        base.amountZatoshi = amount.toString();
      } catch (error) {
        errors.push({ index, message: error instanceof Error ? error.message : "Invalid amount." });
      }
      try {
        const report = assertShieldedDestination(line.address, cfg.network);
        base.addressKind = report.kind;
        if (!cfg.allowSimulated) {
          const receiver = saplingReceiver(line.address);
          if (!receiver.sapling) errors.push({ index, message: "ASH verifies Sapling payments. Use a Sapling address, or a unified address that includes Sapling." });
        }
        if (seen.has(base.address)) errors.push({ index, message: "Duplicate recipient address." });
        seen.add(base.address);
      } catch (error) {
        errors.push({ index, message: error instanceof Error ? error.message : "Invalid address." });
      }
      return base;
    });
    const operationId = newId("op");
    const valid = errors.length === 0;
    let proof: SumProof | null = null;
    if (valid) {
      proof = proveAmountSum(
        lines.map((line) => BigInt(line.amountZatoshi)),
        `ash-payroll:${operationId}`,
      );
      lines.forEach((line, index) => {
        line.state = "ready";
        line.commitment = proof?.commitments[index] ?? null;
      });
    } else {
      for (const line of lines) {
        const messages = errors.filter((error) => error.index === lines.indexOf(line)).map((error) => error.message);
        line.state = messages.length > 0 ? "invalid" : "ready";
        line.error = messages.length > 0 ? messages.join(" ") : null;
      }
    }
    const created = await createOperation(tx, {
      id: operationId,
      type: "payroll_run",
      state: "draft",
      initiatorId: actor.user.id,
      participantIds: [actor.user.id],
      label: input.name.trim(),
      parentId: null,
      payment: null,
      access: null,
      disclosures: [DISCLOSURES.simulated, DISCLOSURES.diversification, DISCLOSURES.metadata, DISCLOSURES.orchard],
    });
    const payroll: PayrollData = { operationId, network: cfg.network, lines, errors, proof };
    await tx.put("payroll", operationId, payroll, null);
    if (!valid) return { version: created.version, operation: created.data, payroll };
    const validated = await saveOperation(tx, created, { ...created.data, state: "validated" }, "validated", "batch accepted");
    return { version: validated.version, operation: validated.data, payroll };
  });
}

export async function authorizePayroll(tx: Tx, actor: Actor, id: string, expectedVersion: number) {
  assertPerson(actor);
  assertRole(actor, ["operator"]);
  const current = await mustGet<OperationRecord>(tx, "operation", id);
  if (current.version !== expectedVersion) throw new AshError("conflict", "The run changed. Reload it and try again.", 409);
  if (current.data.initiatorId !== actor.user.id) throw new AshError("forbidden", "Only the operator who created the run can authorize it.", 403);
  const payroll = await mustGet<PayrollData>(tx, "payroll", id);
  if (payroll.data.errors.length > 0 || payroll.data.lines.some((line) => line.state === "invalid")) {
    throw new AshError("invalid_state", "Fix invalid lines before authorization.", 409);
  }
  const saved = await saveOperation(tx, current, { ...current.data, state: "authorized" }, "authorized", "operator authorized");
  return { version: saved.version, operation: saved.data, payroll: payroll.data };
}

async function payLines(tx: Tx, actor: Actor, payroll: PayrollData, onlyLineId?: string): Promise<PayrollData> {
  const cfg = config();
  const lines = payroll.lines.map((line) => ({ ...line }));
  for (const line of lines) {
    if (onlyLineId && line.id !== onlyLineId) continue;
    if (line.state === "verified" || line.state === "cancelled" || line.state === "invalid") continue;
    if (line.state === "failed") {
      line.attempt += 1;
      line.error = null;
    }
    const key = `${line.id}:${line.attempt}`;
    const payment = await settleSimulated(tx, actor, {
      idempotencyKey: key,
      amountZatoshi: line.amountZatoshi,
      feeZatoshi: line.feeZatoshi,
    });
    line.txId = payment.txId;
    line.paymentMode = payment.mode;
    if (paymentSatisfies(payment, cfg.allowSimulated)) {
      line.state = "verified";
      line.error = null;
    } else if (payment.status === "observed") {
      line.state = "observed";
      line.error = payment.reason;
    } else {
      line.state = "failed";
      line.error = payment.reason || "Payment was not verified.";
    }
  }
  return { ...payroll, lines };
}

export async function executePayroll(tx: Tx, actor: Actor, id: string, expectedVersion: number) {
  assertScope(actor, "payroll");
  if (actor.kind === "user") assertRole(actor, ["operator"]);
  const current = await mustGet<OperationRecord>(tx, "operation", id);
  if (current.version !== expectedVersion) throw new AshError("conflict", "The run changed. Reload it and try again.", 409);
  if (current.data.initiatorId !== actor.user.id) throw new AshError("forbidden", "You cannot execute this run.", 403);
  if (!["authorized", "partially_completed", "failed"].includes(current.data.state)) {
    throw new AshError("invalid_state", "Authorize the run before executing it.", 409);
  }
  if (!config().allowSimulated) {
    throw new AshError("txid_required", "Pay each line from your wallet, then record its transaction id. ASH does not send payments.", 400);
  }
  const payroll = await mustGet<PayrollData>(tx, "payroll", id);
  const executing = await saveOperation(tx, current, { ...current.data, state: "executing" }, "executing", "payment adapter started");
  const paid = await payLines(tx, actor, payroll.data);
  const state = deriveState(paid.lines);
  assertCompletable(paid.lines, state);
  await tx.put("payroll", id, paid, payroll.version);
  const saved = await saveOperation(tx, executing, { ...executing.data, state }, state, "line states updated");
  return { version: saved.version, operation: saved.data, payroll: paid };
}

export async function retryPayrollLine(tx: Tx, actor: Actor, id: string, lineId: string, expectedVersion: number) {
  assertPerson(actor);
  assertRole(actor, ["operator"]);
  const current = await mustGet<OperationRecord>(tx, "operation", id);
  if (current.version !== expectedVersion) throw new AshError("conflict", "The run changed. Reload it and try again.", 409);
  if (current.data.initiatorId !== actor.user.id) throw new AshError("forbidden", "You cannot retry this run.", 403);
  const payroll = await mustGet<PayrollData>(tx, "payroll", id);
  const line = payroll.data.lines.find((item) => item.id === lineId);
  if (!line || line.state !== "failed") throw new AshError("invalid_state", "Only a failed line can be retried.", 409);
  if (!config().allowSimulated) {
    throw new AshError("txid_required", "Pay this line again from your wallet, then record the new transaction id.", 400);
  }
  const started =
    current.data.state === "executing"
      ? current
      : await saveOperation(tx, current, { ...current.data, state: "executing" }, "executing", "retry started");
  const paid = await payLines(tx, actor, payroll.data, lineId);
  const state = deriveState(paid.lines);
  assertCompletable(paid.lines, state);
  await tx.put("payroll", id, paid, payroll.version);
  const saved = await saveOperation(tx, started, { ...started.data, state }, state, "line retried");
  return { version: saved.version, operation: saved.data, payroll: paid };
}

/**
 * Real modes: the operator paid lines from their wallet and gives ASH the transaction id.
 * ASH recovers the wallet's outgoing notes with its full viewing key and marks each line paid
 * when a note to that line's Sapling address carries at least its amount. Runs outside a
 * database transaction, then writes the result in one.
 */
export async function verifyPayrollTransaction(actor: Actor, id: string, txId: string) {
  assertPerson(actor);
  assertRole(actor, ["operator"]);
  const store = getStore();
  const loaded = await store.read(async (tx) => {
    const current = await mustGet<OperationRecord>(tx, "operation", id);
    if (current.data.initiatorId !== actor.user.id) throw new AshError("forbidden", "You cannot change this run.", 403);
    return withMode(recordMode(current.data), async () => {
      const cfg = config();
      if (cfg.allowSimulated) throw new AshError("invalid_state", "Practice runs record practice payments. Use Record practice payments.", 409);
      if (!["authorized", "executing", "partially_completed", "failed"].includes(current.data.state)) {
        throw new AshError("invalid_state", "Approve the run before recording payments.", 409);
      }
      const payroll = await mustGet<PayrollData>(tx, "payroll", id);
      const key = await verifyingKey(tx, actor.user.id, cfg.network);
      if (!key) throw new AshError("payee_key_missing", `Add your ${cfg.network} wallet address and full viewing key in Settings, so ASH can confirm payments you send.`, 409);
      if (!key.ovk) throw new AshError("invalid_key", "Confirming payments you send needs a full viewing key (uview or zxview), not an incoming one. Update it in Settings.", 409);
      return { cfg, payroll: payroll.data, ovk: key.ovk };
    });
  });
  const pending = loaded.payroll.lines.filter((line) => ["ready", "failed", "observed"].includes(line.state));
  const lines = pending.flatMap((line) => {
    const receiver = saplingReceiver(line.address);
    return receiver.sapling ? [{ id: line.id, address: receiver.sapling, minZatoshi: BigInt(line.amountZatoshi) }] : [];
  });
  let outcome: Awaited<ReturnType<typeof checkOutgoing>>;
  try {
    outcome = await checkOutgoing(loaded.cfg.lightwalletdUrl, txId.toLowerCase(), loaded.ovk, lines);
  } catch (error) {
    if (error instanceof LightwalletdError) throw new AshError("network_unavailable", `ASH could not reach the Zcash ${loaded.cfg.network} network. ${error.message}`, 503);
    throw error;
  }
  if (outcome.status !== "found") throw new AshError("payment_unverified", outcome.reason, 402);
  if (outcome.matches.length === 0) {
    throw new AshError("payment_unverified", "This transaction does not pay any unpaid line from your wallet. Check that it was sent from the account whose viewing key you added.", 402);
  }
  return store.transaction(async (tx) =>
    withMode(loaded.cfg.mode, async () => {
      const current = await mustGet<OperationRecord>(tx, "operation", id);
      const payroll = await mustGet<PayrollData>(tx, "payroll", id);
      const nextLines = payroll.data.lines.map((line) => ({ ...line }));
      const confirmed = outcome.confirmations >= loaded.cfg.requiredConfirmations;
      for (const match of outcome.matches) {
        const line = nextLines.find((item) => item.id === match.lineId);
        if (!line || line.state === "verified" || line.state === "cancelled") continue;
        const outputKey = `${loaded.cfg.network}:${txId.toLowerCase()}:${match.outputIndex}`;
        const used = await tx.get<{ ref: string }>("used_output", outputKey);
        if (used && used.data.ref !== `${id}:${line.id}`) continue;
        if (!used) await tx.put("used_output", outputKey, { ref: `${id}:${line.id}` }, null);
        line.txId = txId.toLowerCase();
        line.paymentMode = "chain_verified";
        line.state = confirmed ? "verified" : "observed";
        line.error = confirmed
          ? null
          : outcome.height === null
            ? "Seen in the mempool. Record the same transaction again after it is mined."
            : `${outcome.confirmations} of ${loaded.cfg.requiredConfirmations} confirmations. Record it again shortly.`;
      }
      const started = current.data.state === "executing" ? current : await saveOperation(tx, current, { ...current.data, state: "executing" }, "executing", "wallet payment recorded");
      const state = deriveState(nextLines);
      assertCompletable(nextLines, state);
      await tx.put("payroll", id, { ...payroll.data, lines: nextLines }, payroll.version);
      const saved = await saveOperation(tx, started, { ...started.data, state }, state, "verified on chain", txId.toLowerCase());
      return { version: saved.version, operation: saved.data, payroll: { ...payroll.data, lines: nextLines }, matched: outcome.matches.length, confirmations: outcome.confirmations };
    }),
  );
}

export async function cancelPayrollLine(tx: Tx, actor: Actor, id: string, lineId: string, expectedVersion: number) {
  assertPerson(actor);
  const current = await mustGet<OperationRecord>(tx, "operation", id);
  if (current.version !== expectedVersion) throw new AshError("conflict", "The run changed. Reload it and try again.", 409);
  if (current.data.initiatorId !== actor.user.id) throw new AshError("forbidden", "You cannot change this run.", 403);
  const payroll = await mustGet<PayrollData>(tx, "payroll", id);
  const lines = payroll.data.lines.map((line) => (line.id === lineId ? { ...line } : line));
  const line = lines.find((item) => item.id === lineId);
  if (!line || !["failed", "ready", "invalid"].includes(line.state)) {
    throw new AshError("invalid_state", "A verified or observed line cannot be cancelled.", 409);
  }
  line.state = "cancelled";
  const nextPayroll = { ...payroll.data, lines };
  const active = lines.filter((item) => item.state !== "cancelled");
  const state: OperationState =
    active.length === 0
      ? "cancelled"
      : current.data.state === "draft" || current.data.state === "validated" || current.data.state === "authorized"
        ? current.data.state
        : deriveState(lines);
  assertCompletable(lines, state);
  await tx.put("payroll", id, nextPayroll, payroll.version);
  const from = current.data.state === "draft" || current.data.state === "validated" ? current : current;
  const saved = await saveOperation(tx, from, { ...from.data, state: state === "cancelled" ? "cancelled" : state }, "line_cancelled", lineId);
  return { version: saved.version, operation: saved.data, payroll: nextPayroll };
}

export async function cancelPayroll(tx: Tx, actor: Actor, id: string, expectedVersion: number) {
  assertPerson(actor);
  const current = await mustGet<OperationRecord>(tx, "operation", id);
  if (current.version !== expectedVersion) throw new AshError("conflict", "The run changed. Reload it and try again.", 409);
  if (current.data.initiatorId !== actor.user.id) throw new AshError("forbidden", "You cannot cancel this run.", 403);
  const payroll = await mustGet<PayrollData>(tx, "payroll", id);
  if (payroll.data.lines.some((line) => line.state === "verified" || line.state === "observed")) {
    throw new AshError("invalid_state", "Cancel remaining failed lines individually after a payment has been recorded.", 409);
  }
  const lines = payroll.data.lines.map((line) => ({ ...line, state: "cancelled" as const }));
  await tx.put("payroll", id, { ...payroll.data, lines }, payroll.version);
  const saved = await saveOperation(tx, current, { ...current.data, state: "cancelled" }, "cancelled", "run cancelled");
  return { version: saved.version, operation: saved.data, payroll: { ...payroll.data, lines } };
}

export async function payrollReport(tx: Tx, actor: Actor, id: string, view: "operator" | "aggregate") {
  const current = await mustGet<OperationRecord>(tx, "operation", id);
  const payroll = await mustGet<PayrollData>(tx, "payroll", id);
  const amounts = payroll.data.lines.filter((line) => line.state !== "invalid");
  const totalAmount = amounts.reduce((sum, line) => sum + BigInt(line.amountZatoshi), 0n);
  const totalFee = amounts.reduce((sum, line) => sum + BigInt(line.feeZatoshi), 0n);
  const counts: Record<string, number> = {};
  for (const line of payroll.data.lines) counts[line.state] = (counts[line.state] ?? 0) + 1;
  const proof = payroll.data.proof;
  const aggregate = {
    operationId: id,
    label: current.data.label,
    state: current.data.state,
    mode: recordMode(current.data),
    currency: "zatoshi",
    totalAmountZatoshi: totalAmount.toString(),
    totalFeeZatoshi: totalFee.toString(),
    lineCount: payroll.data.lines.length,
    counts,
    proof,
    proofValid: proof ? verifyAmountSum(proof).valid : false,
    recipientDetails: "omitted",
    disclosures: [DISCLOSURES.evidence, "Commitments hide the split. The server that built them stored the line amounts for the operator."],
  };
  if (actor.user.role === "auditor" && view !== "aggregate") {
    throw new AshError("forbidden", "Auditors receive the aggregate report only.", 403);
  }
  if (view === "aggregate") {
    if (actor.user.role !== "auditor" && current.data.initiatorId !== actor.user.id) {
      throw new AshError("forbidden", "You cannot view this report.", 403);
    }
    return aggregate;
  }
  assertParticipant(actor, current.data.initiatorId, current.data.participantIds);
  return { ...aggregate, recipientDetails: "included", lines: payroll.data.lines, errors: payroll.data.errors, version: current.version };
}

export async function getPayroll(tx: Tx, actor: Actor, id: string) {
  return payrollReport(tx, actor, id, actor.user.role === "auditor" ? "aggregate" : "operator");
}

export async function listPayroll(tx: Tx, actor: Actor) {
  const ops = await tx.list<OperationRecord>("operation");
  const mode = currentMode();
  return ops
    .filter((item) => item.data.type === "payroll_run" && recordMode(item.data) === mode)
    .filter((item) => actor.user.role === "auditor" || item.data.initiatorId === actor.user.id)
    .map((item) => ({
      id: item.id,
      version: item.version,
      label: item.data.label,
      state: item.data.state,
      updatedAt: item.data.updatedAt,
    }));
}

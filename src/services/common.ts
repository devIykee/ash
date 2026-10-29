import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { canonicalJson } from "@/domain/canonical";
import { AshError } from "@/domain/errors";
import { paymentResult } from "@/domain/payment";
import { DISCLOSURES, type PaymentRecord, type Role, type User } from "@/domain/types";
import { config } from "@/server/config";
import type { Tx } from "@/store/types";

export type AgentToken = {
  id: string;
  ownerId: string;
  name: string;
  prefix: string;
  secretHash: string;
  budgetZatoshi: string;
  spentZatoshi: string;
  charges: Record<string, string>;
  scopes: string[];
  revokedAt: string | null;
  createdAt: string;
};

export type Actor = { kind: "user"; user: User } | { kind: "agent"; user: User; token: AgentToken };

const forcedFailures = new Set<string>();

export function failNextPayment(idempotencyKey: string): void {
  forcedFailures.add(idempotencyKey);
}

type Ledger = {
  status: PaymentRecord["status"];
  mode: PaymentRecord["mode"];
  txId: string | null;
  amountZatoshi: string;
  feeZatoshi: string;
  reason: string | null;
  confirmations: number | null;
};

export async function mustGet<T>(tx: Tx, kind: string, id: string): Promise<{ id: string; version: number; data: T }> {
  const doc = await tx.get<T>(kind, id);
  if (!doc) throw new AshError("not_found", "Record not found.", 404);
  return doc;
}

export function assertPerson(actor: Actor): User {
  if (actor.kind !== "user") {
    throw new AshError("agent_forbidden", "An agent cannot authorize this action.", 403);
  }
  return actor.user;
}

export function assertRole(actor: Actor, roles: Role[]): void {
  if (!roles.includes(actor.user.role)) throw new AshError("forbidden", "Your role cannot do this.", 403);
}

export function assertScope(actor: Actor, scope: string): void {
  if (actor.kind === "agent" && !actor.token.scopes.includes(scope)) {
    throw new AshError("forbidden", `This agent token does not include the ${scope} scope.`, 403);
  }
}

export function assertParticipant(actor: Actor, initiatorId: string, participantIds: string[]): void {
  if (initiatorId !== actor.user.id && !participantIds.includes(actor.user.id)) {
    throw new AshError("forbidden", "You are not a participant in this operation.", 403);
  }
}

export async function idempotent<T>(
  tx: Tx,
  scope: string,
  key: string | null,
  hash: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!key) return fn();
  const id = `${scope}:${key}`;
  const existing = await tx.get<{ hash: string; body: T }>("idempotency", id);
  if (existing) {
    if (existing.data.hash !== hash) {
      throw new AshError("idempotency_conflict", "This idempotency key was already used for a different request.", 409);
    }
    return existing.data.body;
  }
  const body = await fn();
  await tx.put("idempotency", id, { hash, body }, null);
  return body;
}

export async function chargeAgent(tx: Tx, actor: Actor, amount: bigint, key: string): Promise<void> {
  if (actor.kind !== "agent") return;
  const doc = await mustGet<AgentToken>(tx, "agent_token", actor.token.id);
  if (doc.data.revokedAt) throw new AshError("forbidden", "This agent token has been revoked.", 403);
  if (doc.data.charges[key]) return;
  const spent = BigInt(doc.data.spentZatoshi) + amount;
  if (spent > BigInt(doc.data.budgetZatoshi)) {
    throw new AshError("budget_exceeded", "This payment exceeds the agent's remaining budget.", 402);
  }
  await tx.put(
    "agent_token",
    doc.id,
    {
      ...doc.data,
      spentZatoshi: spent.toString(),
      charges: { ...doc.data.charges, [key]: amount.toString() },
    },
    doc.version,
  );
}

function ledgerToPayment(ledger: Ledger, idempotencyKey: string): PaymentRecord {
  const cfg = config();
  return paymentResult({
    ...ledger,
    network: cfg.network,
    idempotencyKey,
    requiredConfirmations: cfg.requiredConfirmations,
  });
}

export async function settleSimulated(
  tx: Tx,
  actor: Actor,
  input: { idempotencyKey: string; amountZatoshi: string; feeZatoshi: string },
): Promise<PaymentRecord> {
  const cfg = config();
  if (!cfg.allowSimulated) {
    throw new AshError("payment_unverified", "Simulated payments are disabled while ASH is in chain mode.", 409);
  }
  const existing = await tx.get<Ledger>("payment_ledger", input.idempotencyKey);
  if (existing) return ledgerToPayment(existing.data, input.idempotencyKey);
  if (forcedFailures.delete(input.idempotencyKey)) {
    const rejected: Ledger = {
      status: "rejected",
      mode: "simulated",
      txId: null,
      amountZatoshi: input.amountZatoshi,
      feeZatoshi: input.feeZatoshi,
      reason: "Simulated failure injected so a retry can be tested. No second debit is recorded for this attempt.",
      confirmations: null,
    };
    await tx.put("payment_ledger", input.idempotencyKey, rejected, null);
    return ledgerToPayment(rejected, input.idempotencyKey);
  }
  await chargeAgent(tx, actor, BigInt(input.amountZatoshi), input.idempotencyKey);
  const txId = `sim_${bytesToHex(sha256(utf8ToBytes(input.idempotencyKey))).slice(0, 32)}`;
  const ledger: Ledger = {
    status: "verified",
    mode: "simulated",
    txId,
    amountZatoshi: input.amountZatoshi,
    feeZatoshi: input.feeZatoshi,
    reason: DISCLOSURES.simulated,
    confirmations: null,
  };
  await tx.put("payment_ledger", input.idempotencyKey, ledger, null);
  return ledgerToPayment(ledger, input.idempotencyKey);
}

export function requestHash(value: unknown): string {
  return bytesToHex(sha256(utf8ToBytes(canonicalJson(value))));
}

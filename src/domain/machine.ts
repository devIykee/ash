import { AshError } from "./errors";
import type { OperationState, OperationType } from "./types";

const EDGES: Record<OperationType, Partial<Record<OperationState, readonly OperationState[]>>> = {
  payroll_run: {
    draft: ["validated", "cancelled"],
    validated: ["authorized", "draft", "cancelled"],
    authorized: ["executing", "cancelled"],
    executing: ["partially_completed", "completed", "failed"],
    partially_completed: ["executing", "completed", "failed"],
    failed: ["executing", "cancelled"],
  },
  tip: {
    draft: ["awaiting_payment", "cancelled"],
    awaiting_payment: ["payment_observed", "payment_verified", "failed", "expired", "cancelled"],
    payment_observed: ["payment_verified", "failed", "expired"],
    payment_verified: ["completed"],
  },
  api_request: {
    draft: ["awaiting_payment", "expired", "cancelled"],
    awaiting_payment: ["payment_verified", "expired", "cancelled"],
    payment_verified: ["completed"],
  },
  data_exchange: {
    awaiting_seller: ["awaiting_payment", "cancelled", "failed"],
    awaiting_payment: ["payment_observed", "payment_verified", "cancelled", "expired"],
    payment_observed: ["payment_verified", "failed", "expired"],
    payment_verified: ["delivered", "delivery_failed"],
    delivered: ["completed", "disputed"],
    delivery_failed: ["recovered", "disputed"],
    recovered: ["completed"],
    disputed: ["completed"],
  },
  audit_grant: {
    draft: ["authorized", "cancelled"],
    authorized: ["expired", "cancelled"],
  },
  subscription: {
    draft: ["awaiting_payment", "cancelled"],
    awaiting_payment: ["payment_verified", "cancelled", "expired"],
    payment_verified: ["completed"],
    completed: ["grace", "cancelled", "expired"],
    grace: ["completed", "expired", "cancelled"],
    expired: ["completed", "cancelled"],
  },
  memo_check: {
    draft: ["completed", "cancelled"],
  },
  dispute_evidence: {
    draft: ["completed", "cancelled"],
  },
};

export function allowedTargets(type: OperationType, from: OperationState): readonly OperationState[] {
  return EDGES[type][from] ?? [];
}

export function assertTransition(type: OperationType, from: OperationState, to: OperationState): void {
  if (from === to) return;
  const allowed = allowedTargets(type, from);
  if (!allowed.includes(to)) {
    throw new AshError("invalid_state", `A ${type.replaceAll("_", " ")} cannot move from ${from} to ${to}.`, 409);
  }
}

export function isTerminal(type: OperationType, state: OperationState): boolean {
  return allowedTargets(type, state).length === 0 && state !== "draft";
}

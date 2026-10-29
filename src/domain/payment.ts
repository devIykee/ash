import type { PaymentMode, PaymentRecord, PaymentStatus } from "./types";

/**
 * A simulated payment can only be created in practice mode, so it only ever sits on a practice
 * record. A chain payment satisfies a release only once it is confirmed with enough confirmations.
 */
export function paymentSatisfies(payment: PaymentRecord, _allowSimulated = true): boolean {
  void _allowSimulated;
  if (payment.mode === "simulated") {
    return payment.status === "verified";
  }
  if (payment.status === "confirmed") {
    return (payment.confirmations ?? 0) >= payment.requiredConfirmations;
  }
  return false;
}

export function paymentResult(input: {
  status: PaymentStatus;
  mode: PaymentMode;
  amountZatoshi: string;
  feeZatoshi: string;
  network: PaymentRecord["network"];
  txId?: string | null;
  idempotencyKey: string;
  confirmations?: number | null;
  requiredConfirmations: number;
  reason?: string | null;
}): PaymentRecord {
  return {
    status: input.status,
    mode: input.mode,
    amountZatoshi: input.amountZatoshi,
    feeZatoshi: input.feeZatoshi,
    network: input.network,
    txId: input.txId ?? null,
    idempotencyKey: input.idempotencyKey,
    confirmations: input.confirmations ?? null,
    requiredConfirmations: input.requiredConfirmations,
    reason: input.reason ?? null,
  };
}

import type { PaymentMode, PaymentRecord, PaymentStatus } from "./types";

export function paymentSatisfies(payment: PaymentRecord, allowSimulated: boolean): boolean {
  if (payment.mode === "simulated") {
    return allowSimulated && payment.status === "verified";
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

export const POLICY_VERSION = "ash-policy-2026-10-26";

export const OPERATION_TYPES = [
  "payroll_run",
  "tip",
  "api_request",
  "data_exchange",
  "audit_grant",
  "subscription",
  "memo_check",
  "dispute_evidence",
] as const;

export type OperationType = (typeof OPERATION_TYPES)[number];

export const OPERATION_STATES = [
  "draft",
  "validated",
  "authorized",
  "awaiting_seller",
  "awaiting_payment",
  "payment_observed",
  "payment_verified",
  "executing",
  "partially_completed",
  "delivered",
  "grace",
  "delivery_failed",
  "recovered",
  "disputed",
  "completed",
  "restricted",
  "failed",
  "cancelled",
  "expired",
] as const;

export type OperationState = (typeof OPERATION_STATES)[number];

export type Network = "mainnet" | "testnet";
export type Role = "operator" | "creator" | "buyer" | "auditor";

export type PaymentStatus =
  | "instructions_created"
  | "submitted"
  | "observed"
  | "verified"
  | "confirmed"
  | "rejected"
  | "unresolved";

export type PaymentMode = "simulated" | "chain_observation";

export type PaymentRecord = {
  status: PaymentStatus;
  mode: PaymentMode;
  amountZatoshi: string;
  feeZatoshi: string;
  network: Network;
  txId: string | null;
  idempotencyKey: string;
  confirmations: number | null;
  requiredConfirmations: number;
  reason: string | null;
};

export type AccessRecord = {
  kind: string;
  entitled: boolean;
  restricted: boolean;
  note: string;
};

export type OperationRecord = {
  id: string;
  type: OperationType;
  state: OperationState;
  initiatorId: string;
  participantIds: string[];
  policyVersion: string;
  createdAt: string;
  updatedAt: string;
  label: string;
  parentId: string | null;
  disclosures: string[];
  payment: PaymentRecord | null;
  access: AccessRecord | null;
};

export type AshEvent = {
  id: string;
  operationId: string;
  type: string;
  at: string;
  fromState: OperationState | null;
  toState: OperationState | null;
  prevHash: string;
  hash: string;
  ref: string | null;
  note: string | null;
};

export type User = {
  id: string;
  name: string;
  role: Role;
  createdAt: string;
};

export const PERSONAS: readonly User[] = [
  { id: "user_avery", name: "Avery Chen", role: "operator", createdAt: "2026-10-26T00:00:00.000Z" },
  { id: "user_noor", name: "Noor Hale", role: "creator", createdAt: "2026-10-26T00:00:00.000Z" },
  { id: "user_jules", name: "Jules Okonkwo", role: "buyer", createdAt: "2026-10-26T00:00:00.000Z" },
  { id: "user_sam", name: "Sam Ibarra", role: "auditor", createdAt: "2026-10-26T00:00:00.000Z" },
];

export const DISCLOSURES = {
  simulated:
    "Simulated adapter. ASH recorded this payment locally and did not broadcast a Zcash transaction.",
  observed:
    "A node reported that this transaction id exists. That does not prove the amount, recipient, or memo.",
  receipt:
    "The receipt signature proves ASH sealed these fields. It proves a shielded payment only when the verification level says so.",
  viewing:
    "A unified viewing key reveals the whole account, not one diversifier or date range, and ASH cannot revoke it.",
  diversification:
    "ASH does not derive diversified addresses. A viewing key links every diversifier of the same account.",
  escrow:
    "Conditional delivery is a 2-of-3 Shamir split of a file key, with one share on the server. It is not FROST escrow and not an atomic swap.",
  memo: "Memo analysis runs in the browser. It cannot guarantee that a memo is safe.",
  evidence:
    "The package signature shows these bytes were sealed together. It does not make a claim true.",
  metadata:
    "Shielded Zcash hides chain details from the public. It does not hide amounts, names, or files you submit to ASH.",
  orchard:
    "As of NU6.3, wallets pay Orchard-protocol receivers into the Ironwood pool. Orchard itself is withdraw-only. Sapling still accepts new value. ASH does not build the transaction.",
} as const;

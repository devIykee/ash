export const TYPE_LABEL: Record<string, string> = {
  payroll_run: "Contractor payment",
  tip: "Tip",
  api_request: "Paid request",
  data_exchange: "File exchange",
  audit_grant: "Limited audit access",
  subscription: "Subscription",
  memo_check: "Memo check",
  dispute_evidence: "Evidence package",
};

const STATE_LABEL: Record<string, string> = {
  draft: "Draft",
  validated: "Checked",
  authorized: "Approved",
  awaiting_seller: "Waiting for the sender",
  awaiting_payment: "Waiting for payment",
  payment_observed: "Payment seen, not confirmed",
  payment_verified: "Payment accepted",
  executing: "Sending",
  partially_completed: "Partly completed",
  delivered: "Delivered",
  grace: "In the grace period",
  delivery_failed: "Delivery failed",
  delivery_pending: "Waiting for delivery",
  recovered: "Recovered",
  disputed: "Under review",
  completed: "Completed",
  restricted: "Access paused",
  failed: "Payment failed",
  cancelled: "Cancelled",
  expired: "Expired",
  ready: "Ready",
  invalid: "Needs a correction",
  pending_verification: "Checking payment",
  confirmed: "Payment confirmed",
  instructions_created: "Payment instructions ready",
  submitted: "Submitted for checking",
  observed: "Payment seen, not confirmed",
  verified: "Payment accepted",
  rejected: "Payment rejected",
  unresolved: "Not confirmed yet",
};

const EVENT_LABEL: Record<string, string> = {
  created: "Record created",
  validated: "Batch checked",
  authorized: "Approved",
  executing: "Sending started",
  published: "Page published",
  payment_recorded: "Payment recorded",
  receipt_issued: "Receipt created",
  completed: "Completed",
  cancelled: "Cancelled",
  line_cancelled: "One line cancelled",
  sealed: "Evidence sealed",
  withdrawn: "Access withdrawn",
  expired: "Expired",
  delivered: "Marked delivered",
};

const RECEIPT_FIELD: Record<string, string> = {
  format: "Record type",
  id: "Receipt reference",
  tipId: "Tip page",
  network: "Network",
  amountZatoshi: "Amount in zatoshis",
  memo: "Memo",
  verificationLevel: "Check level",
  verificationStatement: "What this receipt claims",
  approvedFields: "Fields included",
  createdAt: "Created",
};

export function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? humanize(type);
}

export function stateLabel(value: string): string {
  return STATE_LABEL[value] ?? humanize(value);
}

export function eventLabel(value: string): string {
  return EVENT_LABEL[value] ?? humanize(value);
}

export function receiptFieldLabel(value: string): string {
  return RECEIPT_FIELD[value] ?? humanize(value);
}

export function roleLabel(role: string): string {
  if (role === "operator") return "Pays people";
  if (role === "creator") return "Receives payments";
  if (role === "buyer") return "Buys resources";
  if (role === "auditor") return "Reviews records";
  return humanize(role);
}

export function paymentModeLabel(mode: string): string {
  if (mode === "simulated") return "Practice record. Not sent on the network.";
  if (mode === "chain_observation") return "Seen on the network. This does not prove the amount, recipient, or memo.";
  return humanize(mode);
}

export function verificationLabel(level: string): string {
  if (level === "simulated") return "Practice record. ASH did not broadcast a payment.";
  if (level === "observed") return "A node reported this transaction id. That does not prove the amount, recipient, or memo.";
  if (level === "unverified") return "ASH did not verify this payment.";
  return humanize(level);
}

export function capabilityLabel(value: string): string {
  if (value === "filtered_report") return "Written summary";
  if (value === "uivk") return "Incoming payments disclosure";
  if (value === "ufvk") return "Full account disclosure";
  return humanize(value);
}

export function presentError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  if (!message || message.includes("\n") || /at\s+\S+\s+\(/.test(message)) return fallback;
  return message.replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/g, (token) => stateLabel(token));
}

function humanize(value: string): string {
  const text = value.replaceAll("_", " ").trim();
  if (!text) return value;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function moduleHref(type: string, id: string): string {
  if (type === "payroll_run") return `/payments/payroll/${id}`;
  if (type === "tip") return `/payments/tips/${id}`;
  if (type === "data_exchange") return `/commerce/exchanges/${id}`;
  if (type === "audit_grant") return `/privacy/grants`;
  if (type === "subscription") return `/payments/subscriptions`;
  if (type === "memo_check") return `/privacy/memo`;
  if (type === "api_request") return `/agents`;
  return `/operations/${id}`;
}

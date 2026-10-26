export const TYPE_LABEL: Record<string, string> = {
  payroll_run: "Payroll run",
  tip: "Tip",
  api_request: "API request",
  data_exchange: "Data exchange",
  audit_grant: "Audit grant",
  subscription: "Subscription",
  memo_check: "Memo check",
  dispute_evidence: "Evidence pack",
};

export function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type;
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

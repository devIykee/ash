import Link from "next/link";

export default function PaymentsPage() {
  return (
    <div className="stack">
      <p className="kicker">Payments</p>
      <h1>Shielded payment workflows</h1>
      <p className="lede">Payroll, tips, and subscriptions share the payment adapter. Amounts are zatoshi integers. The simulated adapter is labeled and does not broadcast.</p>
      <div className="grid-2">
        <Link className="card" href="/payments/payroll">
          <h3>Payroll runs</h3>
          <p className="muted">Validate a batch, authorize it, and retry a failed line without paying the others again.</p>
        </Link>
        <Link className="card" href="/payments/tips">
          <h3>Tip pages</h3>
          <p className="muted">ZIP-321 instructions and a receipt that lists only the fields you approved.</p>
        </Link>
        <Link className="card" href="/payments/subscriptions">
          <h3>Renewals</h3>
          <p className="muted">Each period is a new wallet payment. Missed renewals enter grace, then a soft restriction.</p>
        </Link>
      </div>
    </div>
  );
}

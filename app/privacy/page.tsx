import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="stack">
      <p className="kicker">Privacy tools</p>
      <h1>Limit what you reveal</h1>
      <div className="grid-2">
        <Link className="card" href="/privacy/memo">
          <h3>Memo linter</h3>
          <p className="muted">Local pattern checks before a memo reaches a recipient. It does not submit a transaction.</p>
        </Link>
        <Link className="card" href="/privacy/grants">
          <h3>Audit grants</h3>
          <p className="muted">Application records for viewing access. Expiry here does not revoke a key the auditor already holds.</p>
        </Link>
        <Link className="card" href="/docs/PRIVACY">
          <h3>Privacy notes</h3>
          <p className="muted">Who can see metadata, receipts, and chain data.</p>
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Privacy"
        title="Share less than the whole account."
        lede="Check a memo before it leaves this browser, or give a reviewer a record with a stated limit."
      />
      <div className="task-list">
        <Link className="task-link" href="/privacy/memo">
          <strong>Check a memo</strong>
          <span className="muted">Look for emails, phone numbers, and invoice references. The memo is not uploaded with the check.</span>
        </Link>
        <Link className="task-link" href="/privacy/grants">
          <strong>Limited audit access</strong>
          <span className="muted">Share a written summary, or record that a viewing key would reveal the whole account.</span>
        </Link>
        <Link className="task-link" href="/docs/PRIVACY">
          <strong>Privacy notes</strong>
          <span className="muted">The engineering explanation of metadata, receipts, and what the network hides.</span>
        </Link>
      </div>
    </div>
  );
}

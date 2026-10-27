import Link from "next/link";
import { ConsequenceList, PageHeader } from "@/components/page-header";
import { GuideStart } from "@/components/guide-provider";

export const metadata = { title: "Payments" };

export default function PaymentsPage() {
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Payments"
        title="Pay someone, or get paid."
        lede="Contractor runs, tips, and renewals share one payment check. Amounts are exact. Practice payments are labeled and are not broadcast."
        actions={<GuideStart id="payroll">Show me a payment run</GuideStart>}
      />
      <ConsequenceList
        items={[
          { title: "What you need", body: "A shielded address for each person, and an amount in ZEC." },
          { title: "What others see", body: "The receipt or summary you choose. Not your other activity." },
          { title: "If it fails", body: "Retry the failed line. Completed lines are not paid again." },
        ]}
      />
      <div className="task-list">
        <Link className="task-link" href="/payments/payroll">
          <strong>Pay a group</strong>
          <span className="muted">Check a batch, approve it, then record each payment.</span>
        </Link>
        <Link className="task-link" href="/payments/tips">
          <strong>Receive a tip</strong>
          <span className="muted">Publish a page and a wallet request. The receipt lists only the fields you include.</span>
        </Link>
        <Link className="task-link" href="/payments/subscriptions">
          <strong>Renew access</strong>
          <span className="muted">Each period is a new payment. ASH does not charge a wallet on a schedule.</span>
        </Link>
        <Link className="task-link" href="/agents">
          <strong>Pay for one request</strong>
          <span className="muted">Buy the research note. The payment reference works once.</span>
        </Link>
      </div>
    </div>
  );
}

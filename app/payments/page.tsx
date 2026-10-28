import { HandCoins, RefreshCcw, Users, Zap } from "lucide-react";
import { HubTiles } from "@/components/hub-tiles";
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
      <HubTiles
        tiles={[
          { href: "/payments/payroll", title: "Pay a group", body: "Check a batch, approve it, then record each payment.", icon: Users },
          { href: "/payments/tips", title: "Receive a tip", body: "Publish a page and a wallet request. The receipt lists only what you include.", icon: HandCoins, tone: "warm" },
          { href: "/payments/subscriptions", title: "Renew access", body: "Each period is a new payment. ASH never charges a wallet on a schedule.", icon: RefreshCcw, tone: "info" },
          { href: "/agents", title: "Pay for one request", body: "Buy the research note. The payment reference works once.", icon: Zap },
        ]}
      />
    </div>
  );
}

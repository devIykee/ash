import { BookOpen, FileSearch, ScanEye } from "lucide-react";
import { HubTiles } from "@/components/hub-tiles";
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
      <HubTiles
        tiles={[
          { href: "/privacy/memo", title: "Check a memo", body: "Find emails, phone numbers, and invoice references. The memo is not uploaded.", icon: FileSearch },
          { href: "/privacy/grants", title: "Limited audit access", body: "Share a written summary, or record that a viewing key reveals the whole account.", icon: ScanEye, tone: "info" },
          { href: "/docs/PRIVACY", title: "Privacy notes", body: "What the network hides, what receipts show, and what metadata remains.", icon: BookOpen, tone: "warm" },
        ]}
      />
    </div>
  );
}

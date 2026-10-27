import { EvidenceVerify } from "@/components/evidence-desk";
import { GuideStart } from "@/components/guide-provider";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Check evidence" };

export default function VerifyPage() {
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Evidence"
        title="Check an evidence package"
        lede="A matching signature means these bytes were sealed together. It does not prove a payment, a file, or that the signing operator never rewrote an event."
        actions={<GuideStart id="evidence">Guide this check</GuideStart>}
      />
      <EvidenceVerify />
    </div>
  );
}

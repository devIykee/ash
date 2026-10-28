import { GuideStart } from "@/components/guide-provider";
import { ConsequenceList, PageHeader } from "@/components/page-header";
import { PayrollForm } from "@/components/payroll-form";
import { requireActor } from "@/server/current";
import { runtime } from "@/server/runtime";

export const metadata = { title: "New payment run" };

export default async function NewPayrollPage() {
  const actor = await requireActor();
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Payments"
        title="New payment run"
        lede="List the people, the amounts, and their shielded addresses. You will review the list before it is saved."
        actions={<GuideStart id="payroll">Guide this run</GuideStart>}
      />
      <ConsequenceList
        items={[
          { title: "What happens next", body: "Checking the batch saves a draft. Payment is a later step." },
          { title: "Who can see it", body: "You can see each line. A reviewer sees the total, not the addresses." },
          { title: "Can you undo it", body: "You can cancel before a payment is recorded. A recorded payment is not reversed by cancelling." },
        ]}
      />
      {actor.user.role === "operator" ? <PayrollForm runtime={runtime()} /> : <p className="banner">Only Avery Chen can create a payment run. Choose that demo account, then return here.</p>}
    </div>
  );
}

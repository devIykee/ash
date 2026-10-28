import { GuideStart } from "@/components/guide-provider";
import { ConsequenceList, PageHeader } from "@/components/page-header";
import { TipForm } from "@/components/tip-desk";
import { requireActor } from "@/server/current";
import { runtime } from "@/server/runtime";

export const metadata = { title: "New tip page" };

export default async function NewTipPage() {
  const actor = await requireActor();
  const allowed = actor.user.role === "creator" || actor.user.role === "operator";
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Payments"
        title="New tip page"
        lede="Write what the visitor is supporting, and the shielded address that should receive the tip."
        actions={<GuideStart id="tips">Guide this page</GuideStart>}
      />
      <ConsequenceList
        items={[
          { title: "What happens next", body: "Publishing creates a link. A wallet request does not pay by itself." },
          { title: "What a receipt shows", body: "Amount and check level. The note is included only if the payer asks for that." },
          { title: "If payment is unclear", body: "No receipt is issued until ASH accepts the payment record." },
        ]}
      />
      {allowed ? <TipForm runtime={runtime()} /> : <p className="banner">Sign in as Noor Hale to publish a tip page.</p>}
    </div>
  );
}

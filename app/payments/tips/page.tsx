import { HandCoins, Plus } from "lucide-react";
import { RecordList } from "@/components/record-list";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { listTips } from "@/services/tips";
import { currentActor } from "@/server/current";
import { getStore } from "@/server/store";

export const metadata = { title: "Tips" };

export default async function TipsPage() {
  const actor = await currentActor();
  const tips = actor ? await getStore().read((tx) => listTips(tx, actor)) : [];
  const canPublish = actor?.user.role === "creator" || actor?.user.role === "operator";
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Payments"
        title="Tip pages"
        lede="A tip page asks a wallet to pay a shielded address. Publishing it does not collect money. The receipt lists only the fields you include."
        actions={
          canPublish ? (
            <Link className="button" href="/payments/tips/new">
              <Plus size={16} aria-hidden="true" /> New tip page
            </Link>
          ) : null
        }
      />
      <div data-guide="tip-list">
        {tips.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="No tip pages yet"
            body={actor ? "Publish a page when you want a link people can pay. Anyone with the link can open it." : "Sign in as Noor Hale to publish a page. Anyone with the link can open it afterward."}
            action={
              canPublish ? (
                <Link className="button" href="/payments/tips/new">
                  Publish a tip page
                </Link>
              ) : null
            }
          />
        ) : (
          <RecordList
            label="Tip pages"
            rows={tips.map((tip) => ({ href: `/payments/tips/${tip.id}`, title: tip.title, type: "tip", sub: "Public tip page. Anyone with the link can pay." }))}
          />
        )}
      </div>
    </div>
  );
}

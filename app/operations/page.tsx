import { recordLabel } from "@/components/labels";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { GuideStart } from "@/components/guide-provider";
import { typeLabel } from "@/components/labels";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { listOperations } from "@/services/overview";
import { requireActor } from "@/server/current";
import { getStore } from "@/server/store";

export const metadata = { title: "Activity" };

export default async function OperationsPage() {
  const actor = await requireActor();
  const items = await getStore().read((tx) => listOperations(tx, actor));
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Activity"
        title="Records you can open"
        lede="Each record keeps the status, the payment check, and the events. Amounts stay on the record, not in a chart."
        actions={
          <div className="row">
            <Link className="button quiet" href="/operations/verify">
              Check an evidence package
            </Link>
            <GuideStart id="evidence">Guide evidence</GuideStart>
          </div>
        }
      />
      <div data-guide="operation-list" className="stack">
        {items.length === 0 ? (
          <EmptyState title="No activity yet" body="Payments, file exchanges, memo checks, and access records you take part in will appear here." />
        ) : (
          items.map((item) => (
            <Link className="card" key={item.id} href={`/operations/${item.id}`}>
              <p className="kicker">{typeLabel(item.type)}</p>
              <h3>{recordLabel(item.label)}</h3>
              <StatusPill value={item.state} />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

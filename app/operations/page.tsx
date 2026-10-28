import { recordLabel } from "@/components/labels";
import { History, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { GuideStart } from "@/components/guide-provider";
import { typeLabel } from "@/components/labels";
import { PageHeader } from "@/components/page-header";
import { relativeTime } from "@/components/format";
import { RecordList } from "@/components/record-list";
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
              <ShieldCheck size={16} aria-hidden="true" /> Check an evidence package
            </Link>
            <GuideStart id="evidence">Guide evidence</GuideStart>
          </div>
        }
      />
      <div data-guide="operation-list" className="stack">
        {items.length === 0 ? (
          <EmptyState icon={History} title="No activity yet" body="Payments, file exchanges, memo checks, and access records you take part in will appear here." />
        ) : (
          <RecordList
            label="Activity"
            rows={items.map((item) => ({
              href: `/operations/${item.id}`,
              title: recordLabel(item.label),
              type: item.type,
              sub: `${typeLabel(item.type)} · ${relativeTime(item.updatedAt)}`,
              state: item.state,
            }))}
          />
        )}
      </div>
    </div>
  );
}

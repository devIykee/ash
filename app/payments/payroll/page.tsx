import { pageRead } from "@/server/page-data";
import { Plus, Users } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { GuideStart } from "@/components/guide-provider";
import { PageHeader } from "@/components/page-header";
import { relativeTime } from "@/components/format";
import { RecordList } from "@/components/record-list";
import { listPayroll } from "@/services/payroll";
import { requireActor } from "@/server/current";

export const metadata = { title: "Contractor payments" };

export default async function PayrollListPage() {
  const actor = await requireActor();
  const runs = await pageRead((tx) => listPayroll(tx, actor));
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Payments"
        title="Contractor payments"
        lede="A run is a list of people and amounts. Checking it does not send money. You approve it, then record the payments."
        actions={
          actor.user.role === "operator" ? (
            <Link className="button" href="/payments/payroll/new">
              <Plus size={16} aria-hidden="true" /> New payment run
            </Link>
          ) : (
            <GuideStart id="payroll">How payment runs work</GuideStart>
          )
        }
      />
      {actor.user.role === "auditor" ? <p className="banner">You can see the total and the status. Names and addresses stay on the payer’s view.</p> : null}
      <div data-guide="payroll-list" className="stack">
        {runs.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No payment runs yet"
            body="Create a run when you know who to pay. Nothing is sent until you approve the run and then record the payments."
            action={
              actor.user.role === "operator" ? (
                <Link className="button" href="/payments/payroll/new">
                  Create the first run
                </Link>
              ) : (
                <p className="muted">Sign in as Avery Chen to create one.</p>
              )
            }
          />
        ) : (
          <RecordList
            label="Payment runs"
            rows={runs
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .map((run) => ({
                href: `/payments/payroll/${run.id}`,
                title: run.label,
                type: "payroll_run",
                sub: `Updated ${relativeTime(run.updatedAt)}`,
                state: run.state,
              }))}
          />
        )}
      </div>
    </div>
  );
}

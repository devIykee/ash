import Link from "next/link";
import { notFound } from "next/navigation";
import { PayrollDesk } from "@/components/payroll-desk";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { AshError } from "@/domain/errors";
import { zatoshiToZec } from "@/domain/money";
import { getPayroll } from "@/services/payroll";
import { config } from "@/server/config";
import { requireActor } from "@/server/current";
import { getStore } from "@/server/store";

export const metadata = { title: "Payment run" };

export default async function PayrollPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  try {
    const report = await getStore().transaction((tx) => getPayroll(tx, actor, id));
    const lines = "lines" in report ? report.lines : null;
    const version = "version" in report ? report.version : 0;
    return (
      <div className="stack">
        <PageHeader eyebrow="Payments" title={report.label} lede="Approve the run before you record payments. A failed line can be retried without paying the others again." />
        <StatusPill value={report.state} />
        <p>
          {zatoshiToZec(BigInt(report.totalAmountZatoshi))} ZEC, plus {zatoshiToZec(BigInt(report.totalFeeZatoshi))} ZEC in estimated fees.
        </p>
        <p className="muted">
          {report.proofValid
            ? "A math check matches the committed total. It does not prove that anyone was paid."
            : "There is no math check for the total yet. That does not, by itself, mean a payment failed."}
        </p>
        <PayrollDesk id={id} version={version} state={report.state} canOperate={actor.user.role === "operator"} lines={lines} practice={config().allowSimulated} />
        <Link href={`/operations/${id}`}>Open the activity record</Link>
      </div>
    );
  } catch (error) {
    if (error instanceof AshError && error.status === 404) notFound();
    throw error;
  }
}

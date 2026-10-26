import Link from "next/link";
import { notFound } from "next/navigation";
import { PayrollDesk } from "@/components/payroll-desk";
import { AshError } from "@/domain/errors";
import { zatoshiToZec } from "@/domain/money";
import { getPayroll } from "@/services/payroll";
import { requireActor } from "@/server/current";
import { getStore } from "@/server/store";

export default async function PayrollPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  try {
    const report = await getStore().transaction((tx) => getPayroll(tx, actor, id));
    const lines = "lines" in report ? report.lines : null;
    const version = "version" in report ? report.version : 0;
    return (
      <div className="stack">
        <p className="kicker">Payroll</p>
        <h1>{report.label}</h1>
        <span className="pill" data-state={report.state}>
          {report.state.replaceAll("_", " ")}
        </span>
        <p className="mono">
          {zatoshiToZec(BigInt(report.totalAmountZatoshi))} ZEC plus {zatoshiToZec(BigInt(report.totalFeeZatoshi))} ZEC estimated fees
        </p>
        <p className="muted">Sum proof {report.proofValid ? "checks" : "is absent"}. It proves a committed total, not that anyone was paid.</p>
        <PayrollDesk id={id} version={version} canOperate={actor.user.role === "operator"} lines={lines} />
        <Link href={`/operations/${id}`}>Operation record</Link>
      </div>
    );
  } catch (error) {
    if (error instanceof AshError && error.status === 404) notFound();
    throw error;
  }
}

import { pageRead } from "@/server/page-data";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PayrollDesk } from "@/components/payroll-desk";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { Stepper } from "@/components/stepper";
import { AshError } from "@/domain/errors";
import { zatoshiToZec } from "@/domain/money";
import { getPayroll } from "@/services/payroll";
import { config } from "@/server/config";
import { buildZip321 } from "@/zcash/zip321";
import { saplingReceiver } from "@/zcash/unified";
import { requireActor } from "@/server/current";

export const metadata = { title: "Payment run" };

// Real payments are verified on the Sapling pool, so the wallet link pays each Sapling receiver.
function saplingFor(address: string): string {
  try {
    return saplingReceiver(address).saplingEncoded ?? address;
  } catch {
    return address;
  }
}

const PAYROLL_STEPS = [
  { label: "Checked", hint: "Addresses and amounts" },
  { label: "Approved", hint: "By the operator" },
  { label: "Payments recorded", hint: "Line by line" },
  { label: "Finished", hint: "Every line paid" },
];

function payrollStep(state: string): number {
  if (state === "draft") return 0;
  if (state === "validated") return 1;
  if (state === "authorized" || state === "executing" || state === "partially_completed" || state === "failed") return 2;
  return 4;
}

export default async function PayrollPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  try {
    const report = await pageRead((tx) => getPayroll(tx, actor, id));
    const lines = "lines" in report ? report.lines : null;
    const version = "version" in report ? report.version : 0;
    const unpaid = (lines ?? []).filter((line) => line.state === "ready" || line.state === "failed").slice(0, 50);
    let walletUri: string | null = null;
    try {
      walletUri = unpaid.length > 0
        ? buildZip321(
            unpaid.map((line) => ({ address: saplingFor(line.address), amountZatoshi: BigInt(line.amountZatoshi), label: line.label })),
            config(report.mode).network,
          )
        : null;
    } catch {
      walletUri = null;
    }
    return (
      <div className="stack">
        <PageHeader eyebrow="Payments" title={report.label} lede="Approve the run before you record payments. A failed line can be retried without paying the others again." />
        {report.state === "cancelled" ? null : (
          <Stepper steps={PAYROLL_STEPS} current={payrollStep(report.state)} failed={report.state === "failed" || report.state === "draft"} />
        )}
        <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))" }}>
          <div className="stat">
            <span className="stat-label">Total</span>
            <span className="stat-value">{zatoshiToZec(BigInt(report.totalAmountZatoshi))} ZEC</span>
          </div>
          <div className="stat">
            <span className="stat-label">Estimated fees</span>
            <span className="stat-value">{zatoshiToZec(BigInt(report.totalFeeZatoshi))}</span>
          </div>
          <div className="stat">
            <span className="stat-label">People</span>
            <span className="stat-value">{report.lineCount}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Status</span>
            <span>
              <StatusPill value={report.state} />
            </span>
          </div>
        </div>
        <p className="muted">
          {report.proofValid
            ? "A math check matches the committed total. It does not prove that anyone was paid."
            : "There is no math check for the total yet. That does not, by itself, mean a payment failed."}
        </p>
        <PayrollDesk id={id} version={version} state={report.state} canOperate={actor.user.role === "operator"} lines={lines} practice={config(report.mode).allowSimulated} walletUri={walletUri} />
        <Link className="link-arrow" href={`/operations/${id}`}>Open the activity record <ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
    );
  } catch (error) {
    if (error instanceof AshError && error.status === 404) notFound();
    throw error;
  }
}

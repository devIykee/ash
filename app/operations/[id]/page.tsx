import Link from "next/link";
import { notFound } from "next/navigation";
import { EvidenceExport } from "@/components/evidence-desk";
import { eventLabel, moduleHref, paymentModeLabel, stateLabel, typeLabel } from "@/components/labels";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { zatoshiToZec } from "@/domain/money";
import { operationDetail } from "@/services/overview";
import { requireActor } from "@/server/current";
import { getStore } from "@/server/store";

export const metadata = { title: "Activity record" };

export default async function OperationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const detail = await getStore().transaction((tx) => operationDetail(tx, actor, id));
  if (!detail || detail === "forbidden") notFound();
  const operation = detail.operation;
  const workflowId = operation.parentId && operation.type === "tip" ? operation.parentId : id;
  return (
    <div className="stack">
      <PageHeader eyebrow={typeLabel(operation.type)} title={operation.label} lede="This is the record ASH kept. It shows the status and the events. It does not add a payment that the check did not accept." />
      <StatusPill value={operation.state} />
      <p className="muted">Reference {operation.id}</p>
      <p className="muted">People on this record: {operation.participantIds.join(", ") || "none recorded"}</p>
      {operation.payment ? (
        <div className="panel stack">
          <h2>Payment</h2>
          <p>
            {stateLabel(operation.payment.status)}. {paymentModeLabel(operation.payment.mode)}
          </p>
          <p>
            {zatoshiToZec(BigInt(operation.payment.amountZatoshi))} ZEC, with a fee of {zatoshiToZec(BigInt(operation.payment.feeZatoshi))} ZEC.
          </p>
          {operation.payment.txId ? <p className="mono">Transaction reference {operation.payment.txId}</p> : <p className="muted">No transaction reference is stored.</p>}
          {operation.payment.reason ? <p>{operation.payment.reason}</p> : null}
        </div>
      ) : (
        <p className="muted">No payment is shown{actor.user.role === "auditor" ? " for a reviewer, or none was recorded." : "."}</p>
      )}
      {operation.access ? (
        <div className="panel stack">
          <h2>Access</h2>
          <p>
            {operation.access.entitled ? "Access is currently allowed." : "Access is not currently allowed."}
            {operation.access.restricted ? " It is paused." : ""}
          </p>
          <p>{operation.access.note}</p>
        </div>
      ) : null}
      {operation.disclosures.map((item) => (
        <p className="banner" key={item}>
          {item}
        </p>
      ))}
      <div className="row">
        <Link className="button" href={moduleHref(operation.type, workflowId)}>
          Open the task
        </Link>
      </div>
      <h2>What changed</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>What happened</th>
              <th>Status change</th>
            </tr>
          </thead>
          <tbody>
            {detail.events.map((event) => (
              <tr key={event.id}>
                <td className="mono">{event.at}</td>
                <td>{eventLabel(event.type)}</td>
                <td>
                  {stateLabel(event.fromState ?? "-")} to {stateLabel(event.toState ?? "-")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Evidence</h2>
      <EvidenceExport operationId={id} />
    </div>
  );
}

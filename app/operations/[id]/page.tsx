import Link from "next/link";
import { notFound } from "next/navigation";
import { EvidenceExport } from "@/components/evidence-desk";
import { moduleHref, typeLabel } from "@/components/labels";
import { operationDetail } from "@/services/overview";
import { requireActor } from "@/server/current";
import { getStore } from "@/server/store";

export default async function OperationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const detail = await getStore().transaction((tx) => operationDetail(tx, actor, id));
  if (!detail || detail === "forbidden") notFound();
  const operation = detail.operation;
  return (
    <div className="stack">
      <p className="kicker">{typeLabel(operation.type)}</p>
      <h1>{operation.label}</h1>
      <span className="pill" data-state={operation.state}>
        {operation.state.replaceAll("_", " ")}
      </span>
      <p className="mono">
        {operation.id} · policy {operation.policyVersion}
      </p>
      <p className="muted">Participants: {operation.participantIds.join(", ") || "none recorded"}</p>
      {operation.payment ? (
        <div className="panel">
          <h2>Payment</h2>
          <p className="mono">
            {operation.payment.status} · {operation.payment.mode} · {operation.payment.amountZatoshi} zatoshi · fee {operation.payment.feeZatoshi}
          </p>
          <p>{operation.payment.reason}</p>
        </div>
      ) : (
        <p className="muted">No payment on this operation{actor.user.role === "auditor" ? ", or it is hidden from the auditor view." : "."}</p>
      )}
      {operation.access ? (
        <div className="panel">
          <h2>Access</h2>
          <p>
            {operation.access.kind}: {operation.access.entitled ? "entitled" : "not entitled"}
            {operation.access.restricted ? ", restricted" : ""}
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
        <Link className="button" href={moduleHref(operation.type, operation.parentId && operation.type === "tip" ? operation.parentId : id)}>
          Open workflow
        </Link>
      </div>
      <h2>Events</h2>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Event</th>
            <th>Transition</th>
          </tr>
        </thead>
        <tbody>
          {detail.events.map((event) => (
            <tr key={event.id}>
              <td className="mono">{event.at}</td>
              <td>{event.type}</td>
              <td className="mono">
                {event.fromState ?? "-"} → {event.toState ?? "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Evidence</h2>
      <EvidenceExport operationId={id} />
    </div>
  );
}

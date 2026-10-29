import { pageRead } from "@/server/page-data";
import { ArrowRight, Circle, CircleCheck, CircleX, KeyRound, Wallet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EvidenceExport } from "@/components/evidence-desk";
import { dateTime, personName, relativeTime } from "@/components/format";
import { TypeIcon } from "@/components/icons";
import { eventLabel, moduleHref, paymentModeLabel, recordLabel, stateLabel, typeLabel } from "@/components/labels";
import { StatusPill } from "@/components/status-pill";
import { zatoshiToZec } from "@/domain/money";
import { operationDetail } from "@/services/overview";
import { requireActor } from "@/server/current";

export const metadata = { title: "Activity record" };

const BAD = new Set(["failed", "delivery_failed", "cancelled", "expired", "rejected", "invalid"]);
const GOOD = new Set(["completed", "payment_verified", "verified", "delivered", "recovered", "validated", "authorized"]);

function EventDot({ state }: { state: string | null }) {
  if (state && BAD.has(state)) return <CircleX size={13} aria-hidden="true" />;
  if (state && GOOD.has(state)) return <CircleCheck size={13} aria-hidden="true" />;
  return <Circle size={9} aria-hidden="true" />;
}

export default async function OperationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const detail = await pageRead((tx) => operationDetail(tx, actor, id));
  if (!detail || detail === "forbidden") notFound();
  const operation = detail.operation;
  const workflowId = operation.parentId && operation.type === "tip" ? operation.parentId : id;
  const people = operation.participantIds.length > 0 ? operation.participantIds.map(personName).join(", ") : "None recorded";
  const events = [...detail.events].reverse();
  return (
    <div className="stack" style={{ gap: "1.4rem" }}>
      <header className="page-head">
        <p className="kicker">{typeLabel(operation.type)}</p>
        <div className="page-head-row">
          <div className="greeting">
            <span className="tile-icon" aria-hidden="true">
              <TypeIcon type={operation.type} size={20} />
            </span>
            <h1>{recordLabel(operation.label)}</h1>
          </div>
          <Link className="button" href={moduleHref(operation.type, workflowId)}>
            Open the task <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <p className="lede">The record ASH kept. It never shows a payment that the check did not accept.</p>
      </header>

      <dl className="panel summary" style={{ padding: 0 }}>
        <div>
          <dt>Status</dt>
          <dd>
            <StatusPill value={operation.state} />
          </dd>
        </div>
        <div>
          <dt>Last change</dt>
          <dd title={dateTime(operation.updatedAt)}>{relativeTime(operation.updatedAt)}</dd>
        </div>
        <div>
          <dt>People</dt>
          <dd>{people}</dd>
        </div>
        <div>
          <dt>Reference</dt>
          <dd className="mono" style={{ fontWeight: 400 }}>
            {operation.id}
          </dd>
        </div>
      </dl>

      <div className="grid-2">
        <section className="panel stack">
          <h2 className="row" style={{ gap: "0.5rem" }}>
            <Wallet size={18} aria-hidden="true" /> Payment
          </h2>
          {operation.payment ? (
            <>
              <p style={{ fontSize: "1.5rem", fontWeight: 500, letterSpacing: "-0.02em" }}>
                {zatoshiToZec(BigInt(operation.payment.amountZatoshi))} ZEC
              </p>
              <StatusPill value={operation.payment.status} />
              <p className="muted">{paymentModeLabel(operation.payment.mode)}</p>
              <p className="muted">Fee {zatoshiToZec(BigInt(operation.payment.feeZatoshi))} ZEC</p>
              {operation.payment.txId ? <p className="mono muted">{operation.payment.txId}</p> : null}
              {operation.payment.reason ? <p className="field-hint">{operation.payment.reason}</p> : null}
            </>
          ) : (
            <p className="muted">No payment is shown{actor.user.role === "auditor" ? " to a reviewer, or none was recorded." : " on this record."}</p>
          )}
        </section>
        <section className="panel stack">
          <h2 className="row" style={{ gap: "0.5rem" }}>
            <KeyRound size={18} aria-hidden="true" /> Access
          </h2>
          {operation.access ? (
            <>
              <p style={{ fontWeight: 500 }}>{operation.access.entitled && !operation.access.restricted ? "Allowed" : "Not allowed yet"}</p>
              <p className="muted">{operation.access.note}</p>
            </>
          ) : (
            <p className="muted">This kind of record does not grant access.</p>
          )}
        </section>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>What changed</h2>
          <span className="faint" style={{ fontSize: "0.86rem" }}>
            Newest first · each event is hash-chained to the one before
          </span>
        </div>
        <div className="panel">
          <ol className="timeline">
            {events.map((event) => (
              <li key={event.id}>
                <span className="dot">
                  <EventDot state={event.toState} />
                </span>
                <div>
                  <p className="what">{eventLabel(event.type)}</p>
                  <p className="when">
                    {event.fromState && event.toState && event.fromState !== event.toState
                      ? `${stateLabel(event.fromState)} → ${stateLabel(event.toState)} · `
                      : event.toState && !event.fromState
                        ? `Started as ${stateLabel(event.toState)} · `
                        : ""}
                    <time dateTime={event.at} title={dateTime(event.at)}>
                      {relativeTime(event.at)}
                    </time>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {operation.disclosures.length > 0 ? (
        <details className="notes quiet-notes">
          <summary>What this record does and does not prove</summary>
          <ul>
            {operation.disclosures.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <section className="section">
        <h2>Evidence</h2>
        <EvidenceExport operationId={id} />
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { GUIDES } from "@/guides/catalog";
import { useGuide } from "./guide-provider";
import { stateLabel } from "./labels";

const TERMS = [
  ["Transaction reference", "The identifier of a payment, sometimes called a transaction id. Seeing one does not prove the amount or the recipient."],
  ["Practice payment", "A payment ASH records locally. It is not broadcast to Zcash."],
  ["Shielded address", "A Zcash address meant for a private payment. ASH does not create one for you."],
  ["Receipt", "A signed summary of the fields you agreed to include. Its check level says what it actually proves."],
  ["Fingerprint", "A hash of a file. If it changes, the file is not the same bytes."],
  ["Limited audit access", "A record of what a reviewer may see. A written summary can be withdrawn in ASH. A viewing key, once copied, cannot."],
  ["Evidence package", "A signed snapshot of an ASH record. A valid signature binds the bytes. It does not make a claim true."],
  ["Protected access key", "The key material that lets a recipient open an encrypted file. It is split so ASH cannot read the file alone."],
  ["Request reference", "An id that keeps a repeated click from creating a second payment for the same action."],
];

const STATUSES = [
  "draft",
  "validated",
  "authorized",
  "awaiting_payment",
  "payment_observed",
  "payment_verified",
  "partially_completed",
  "delivery_failed",
  "disputed",
  "failed",
  "expired",
  "completed",
  "restricted",
  "grace",
];

const STATUS_HELP: Record<string, string> = {
  draft: "Saved, and not yet checked or sent.",
  validated: "The batch passed ASH’s checks. Money has not moved.",
  authorized: "Someone approved the next step. A payment still needs its own action.",
  awaiting_payment: "ASH is waiting for a payment record.",
  payment_observed: "A transaction id was seen. The amount, recipient, and memo are not proven.",
  payment_verified: "ASH accepted the payment record under its current rules. In practice mode, that is not a network broadcast.",
  partially_completed: "Some lines finished and some did not. Retry only the failed lines.",
  delivery_failed: "The buyer reported that the file did not open. The payment is not reversed.",
  disputed: "The record is under review.",
  failed: "The payment was not accepted. You can retry when the screen offers it.",
  expired: "The time limit passed.",
  completed: "ASH marked this task finished.",
  restricted: "Access is paused. The record remains.",
  grace: "The renewal is late, and access has not been paused yet.",
};

const ERRORS = [
  ["We couldn't confirm this payment yet.", "Your payment status has not been verified. Wait, then reload the record before trying again. Do not assume it failed or succeeded."],
  ["The record changed.", "Someone else updated it, or an earlier click landed. Reload the page and review the current amount before you continue."],
  ["Network unavailable.", "If the page cannot reach ASH, a retry is safe only when you still see the same draft. If a payment might already have been recorded, reload before you send it again."],
  ["This browser has no device key.", "Start the purchase again from the same browser, or the sealed file key cannot be opened here."],
  ["Unsupported address.", "ASH accepts shielded Sapling and unified addresses for the selected network. Transparent addresses are refused."],
];

export function HelpCenter() {
  const { start, restart, restartWelcome } = useGuide();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const guides = useMemo(() => GUIDES.filter((guide) => guide.id !== "orient" && (!needle || `${guide.title} ${guide.summary}`.toLowerCase().includes(needle))), [needle]);
  const terms = TERMS.filter(([term, body]) => !needle || `${term} ${body}`.toLowerCase().includes(needle));
  const statuses = STATUSES.filter((status) => !needle || `${status} ${stateLabel(status)} ${STATUS_HELP[status]}`.toLowerCase().includes(needle));
  const errors = ERRORS.filter(([title, body]) => !needle || `${title} ${body}`.toLowerCase().includes(needle));

  return (
    <div className="stack">
      <label>
        Search help
        <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Payment, receipt, file, reviewer" />
      </label>
      <section className="help-block">
        <h2>Guides</h2>
        {guides.length === 0 ? <p className="muted">No guide matches that search.</p> : null}
        <div className="task-list">
          {guides.map((guide) => (
            <button className="task-link" key={guide.id} type="button" onClick={() => start(guide.id, 0)} style={{ textAlign: "left", background: "transparent", borderRadius: 0, color: "inherit" }}>
              <strong>{guide.title}</strong>
              <span className="muted">{guide.summary}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <button className="quiet" type="button" onClick={() => restart("orient")}>
            Restart the quick tour
          </button>
          <button className="quiet" type="button" onClick={restartWelcome}>
            Show the welcome again
          </button>
        </div>
      </section>
      <section className="help-block">
        <h2>Words you will see</h2>
        <div className="terms">
          {terms.map(([term, body]) => (
            <div key={term}>
              <strong>{term}</strong>
              <span className="muted">{body}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="help-block">
        <h2>Payment and delivery statuses</h2>
        <div className="terms">
          {statuses.map((status) => (
            <div key={status}>
              <strong>{stateLabel(status)}</strong>
              <span className="muted">{STATUS_HELP[status]}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="help-block">
        <h2>When something fails</h2>
        <div className="terms">
          {errors.map(([title, body]) => (
            <div key={title}>
              <strong>{title}</strong>
              <span className="muted">{body}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="help-block">
        <h2>What other people can see</h2>
        <p>A person sees the page, receipt, file, or summary you share with them. They do not automatically see your other activity. ASH can still store operational records, including payment references and event history.</p>
        <p className="muted">A reviewer of a written summary sees the text you typed, until you withdraw it in ASH. A copied file or a copied viewing key is outside ASH after that. Practice payments are not network transfers.</p>
        <Link href="/docs/PRIVACY">Privacy notes for engineers</Link>
      </section>
      <section className="help-block">
        <h2>Technical documentation</h2>
        <p className="muted">The manuals keep precise names for schemas, payment rules, and cryptographic limits.</p>
        <div className="row">
          <Link href="/docs">Documentation</Link>
          <Link href="/docs/AGENT_API">Agent API</Link>
          <Link href="/docs/THREAT_MODEL">Security</Link>
        </div>
      </section>
    </div>
  );
}

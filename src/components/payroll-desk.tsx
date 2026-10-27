"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/client/api";
import { zatoshiToZec } from "@/domain/money";
import { ConfirmDialog } from "./confirm-dialog";
import { HelpNote } from "./help-note";
import { paymentModeLabel, presentError, stateLabel } from "./labels";
import { StatusPill } from "./status-pill";

type Line = {
  id: string;
  label: string;
  address: string;
  amountZatoshi: string;
  feeZatoshi: string;
  state: string;
  attempt: number;
  error: string | null;
};

export function PayrollDesk({
  id,
  version,
  canOperate,
  lines,
  practice,
}: {
  id: string;
  version: number;
  canOperate: boolean;
  lines: Line[] | null;
  practice: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<"send" | "cancel" | null>(null);

  async function post(path: string) {
    setError("");
    setPending(true);
    try {
      await api(path, { body: { expectedVersion: version } });
      setConfirm(null);
      router.refresh();
    } catch (caught) {
      setError(presentError(caught, "We couldn't update this payment run. Reload it before trying again."));
    } finally {
      setPending(false);
    }
  }

  if (!lines) return <p className="muted">Recipient names and addresses are hidden in the reviewer view. You can see the total and the status.</p>;
  const total = lines.reduce((sum, line) => sum + BigInt(line.amountZatoshi), 0n);
  return (
    <div className="stack">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Amount</th>
              <th>Estimated fee</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td>
                  {line.label}
                  <div className="mono muted">{line.address}</div>
                </td>
                <td className="mono">{zatoshiToZec(BigInt(line.amountZatoshi))} ZEC</td>
                <td className="mono">{zatoshiToZec(BigInt(line.feeZatoshi))} ZEC</td>
                <td>
                  <StatusPill value={line.state} />
                  {line.error ? <div className="muted">{line.error}</div> : null}
                </td>
                <td>
                  {canOperate && line.state === "failed" ? (
                    <button type="button" onClick={() => post(`/api/ash/payroll/${id}/lines/${line.id}/retry`)} disabled={pending}>
                      Retry this person
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canOperate ? (
        <div className="stack" data-guide="payroll-actions">
          <div className="row">
            <button type="button" onClick={() => post(`/api/ash/payroll/${id}/authorize`)} disabled={pending}>
              Approve run
            </button>
            <button type="button" onClick={() => setConfirm("send")} disabled={pending}>
              {practice ? "Record practice payments" : "Record payments"}
            </button>
            <button className="quiet" type="button" onClick={() => setConfirm("cancel")} disabled={pending}>
              Cancel run
            </button>
          </div>
          <HelpNote label="What these actions do">
            Approve run does not move money. Recording payments uses the current payment mode. Cancelling stops a run that has not recorded a payment. A line that already succeeded is not paid again when you retry a failed one.
          </HelpNote>
        </div>
      ) : null}
      {error ? <p className="alert">{error}</p> : null}
      <ConfirmDialog
        open={confirm === "send"}
        title="Record these payments?"
        body={
          practice
            ? `This records a practice payment for ${lines.length} people, totaling ${zatoshiToZec(total)} ZEC. Nothing is broadcast to Zcash. A failed line can be retried without paying the others again.`
            : "ASH will try to record the payment check. In network-check mode it does not build or broadcast a transaction, and a practice payment is refused."
        }
        confirmLabel={practice ? "Record practice payments" : "Continue"}
        pending={pending}
        onClose={() => setConfirm(null)}
        onConfirm={() => post(`/api/ash/payroll/${id}/execute`)}
      >
        <ul>
          {lines.map((line) => (
            <li key={line.id}>
              {line.label}: {zatoshiToZec(BigInt(line.amountZatoshi))} ZEC · {stateLabel(line.state)}
            </li>
          ))}
        </ul>
        <p className="muted">{practice ? paymentModeLabel("simulated") : paymentModeLabel("chain_observation")}</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "cancel"}
        title="Cancel this run?"
        body="This cancels a run that has not recorded a payment. It does not reverse a payment that already went through. If a payment was recorded, ASH will refuse and ask you to handle failed lines one by one."
        confirmLabel="Cancel run"
        pending={pending}
        onClose={() => setConfirm(null)}
        onConfirm={() => post(`/api/ash/payroll/${id}/cancel`)}
      />
    </div>
  );
}

"use client";

import { useToast } from "./toast";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/client/api";
import { zatoshiToZec } from "@/domain/money";
import { ConfirmDialog } from "./confirm-dialog";
import { HelpNote } from "./help-note";
import { paymentModeLabel, presentError, stateLabel } from "./labels";
import { StatusPill } from "./status-pill";
import { validTxId } from "./wallet-step";

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

function VerifyRun({ disabled, onVerify }: { disabled: boolean; onVerify: (txId: string) => void }) {
  const [txId, setTxId] = useState("");
  return (
    <form
      className="row"
      style={{ flexWrap: "nowrap" }}
      onSubmit={(event) => {
        event.preventDefault();
        onVerify(txId);
      }}
    >
      <label style={{ flex: 1 }}>
        <span className="sr-only">Transaction id</span>
        <input value={txId} onChange={(event) => setTxId(event.target.value.trim())} placeholder="Transaction id from your wallet" spellCheck={false} autoComplete="off" />
      </label>
      <button type="submit" disabled={disabled || !validTxId(txId)}>
        Confirm on chain
      </button>
    </form>
  );
}

export function PayrollDesk({
  id,
  version,
  state,
  canOperate,
  lines,
  practice,
  walletUri,
}: {
  id: string;
  version: number;
  state: string;
  canOperate: boolean;
  lines: Line[] | null;
  practice: boolean;
  walletUri?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<"send" | "cancel" | null>(null);

  async function post(path: string, extra: Record<string, unknown> = {}) {
    setError("");
    setPending(true);
    try {
      await api(path, { body: { expectedVersion: version, ...extra } });
      setConfirm(null);
      toast(
        path.endsWith("/authorize")
          ? "Run approved. Record the payments next."
          : path.endsWith("/execute")
            ? "Payments recorded."
            : path.endsWith("/record")
              ? "Transaction recorded on the line."
              : path.endsWith("/retry")
                ? "Line retried."
                : "Run cancelled.",
      );
      router.refresh();
    } catch (caught) {
      setError(presentError(caught, "We couldn't update this payment run. Reload it before trying again."));
    } finally {
      setPending(false);
    }
  }

  if (!lines) return <p className="muted">Recipient names and addresses are hidden in the reviewer view. You can see the total and the status.</p>;
  const total = lines.reduce((sum, line) => sum + BigInt(line.amountZatoshi), 0n);
  const invalid = lines.some((line) => line.state === "invalid");
  const canApprove = canOperate && state === "validated" && !invalid;
  const canSend = canOperate && ["authorized", "partially_completed", "failed"].includes(state);
  const canRecord = canOperate && !practice && ["authorized", "executing", "partially_completed", "failed"].includes(state);

  async function verify(txId: string) {
    setError("");
    setPending(true);
    try {
      const result = await api<{ matched: number; confirmations: number }>(`/api/ash/payroll/${id}/verify`, { body: { txId } });
      toast(`Found ${result.matched} ${result.matched === 1 ? "payment" : "payments"} in that transaction (${result.confirmations} confirmations).`);
      router.refresh();
    } catch (caught) {
      setError(presentError(caught, "We couldn't confirm that transaction. Nothing changed."));
    } finally {
      setPending(false);
    }
  }
  const canCancel = canOperate && ["draft", "validated", "authorized"].includes(state);
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
                  <div className="mono muted address-line">{line.address}</div>
                </td>
                <td className="mono">{zatoshiToZec(BigInt(line.amountZatoshi))} ZEC</td>
                <td className="mono">{zatoshiToZec(BigInt(line.feeZatoshi))} ZEC</td>
                <td>
                  <StatusPill value={line.state} />
                  {line.error ? <div className="muted">{line.error}</div> : null}
                </td>
                <td>
                  {practice && canOperate && line.state === "failed" ? (
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
          {invalid ? <p className="banner">Correct the highlighted lines before this run can be approved. Nothing has been sent.</p> : null}
          {state === "completed" ? (
            <p className="banner ok">{practice ? "This run is finished. The practice payments were not sent on the network." : "This run is finished."}</p>
          ) : null}
          {canRecord ? (
            <div className="wallet-step">
              <p>
                {walletUri ? (
                  <>
                    <a href={walletUri}>Open every unpaid line in your wallet</a> as one payment, or pay each address yourself.
                  </>
                ) : (
                  "Pay each unpaid line from your wallet."
                )}
              </p>
              <p className="muted">
                Then paste the transaction id. ASH reads the payments you sent with your full viewing key and marks each line paid once it has enough confirmations. Paste it again later to update the confirmations.
              </p>
              <VerifyRun disabled={pending} onVerify={verify} />
            </div>
          ) : null}
          <div className="row">
            {canApprove ? (
              <button type="button" onClick={() => post(`/api/ash/payroll/${id}/authorize`)} disabled={pending}>
                Approve run
              </button>
            ) : null}
            {canSend && practice ? (
              <button type="button" onClick={() => setConfirm("send")} disabled={pending}>
                Record practice payments
              </button>
            ) : null}
            {canCancel ? (
              <button className="quiet" type="button" onClick={() => setConfirm("cancel")} disabled={pending}>
                Cancel run
              </button>
            ) : null}
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
            : "Pay each line from your wallet, then record its transaction id on the line."
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

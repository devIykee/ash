"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, freshKey } from "@/client/api";
import { ConfirmDialog } from "./confirm-dialog";
import { HelpNote } from "./help-note";
import { presentError } from "./labels";

export function TipForm() {
  const router = useRouter();
  const [title, setTitle] = useState("Studio jar");
  const [address, setAddress] = useState("ztestsapling1qv2z2dj8tp5h4zuu4klvlc83qgfjgd2x2a58nz5m4j7uahlsqyfzxdz92enh3zv64w7v6mc0v32");
  const [statement, setStatement] = useState("Tips support the work. The receipt shows only the fields you select.");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const created = await api<{ operation: { id: string } }>("/api/ash/tips", {
        body: { title, address, statement, suggestedZec: ["0.001", "0.01"] },
        idempotencyKey: freshKey("tip"),
      });
      router.push(`/payments/tips/${created.operation.id}`);
      router.refresh();
    } catch (caught) {
      setError(presentError(caught, "We couldn't publish the tip page. Nothing was charged."));
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label data-guide="tip-title">
        Page title
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>
      <label>
        Note for visitors
        <textarea value={statement} onChange={(event) => setStatement(event.target.value)} />
      </label>
      <label data-guide="tip-address">
        Shielded address that receives tips
        <input value={address} onChange={(event) => setAddress(event.target.value)} required spellCheck={false} />
        <span className="field-hint">The sample address is an unfunded test fixture. Replace it before any real use. Publishing does not collect money.</span>
      </label>
      <button type="submit" data-guide="tip-publish">
        Publish tip page
      </button>
      {error ? <p className="alert">{error}</p> : null}
    </form>
  );
}

export function TipPay({ id, suggested, address, practice }: { id: string; suggested: string[]; address: string; practice: boolean }) {
  const router = useRouter();
  const [amount, setAmount] = useState(suggested[0] ?? "0.001");
  const [memo, setMemo] = useState("");
  const [includeMemo, setIncludeMemo] = useState(false);
  const [error, setError] = useState("");
  const [receiptId, setReceiptId] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);

  async function pay() {
    setError("");
    setPending(true);
    try {
      const result = await api<{ receipt: { id: string } | null; payment: { status: string; mode: string } }>(`/api/ash/tips/${id}/pay`, {
        body: { amountZec: amount, memo: memo || undefined, includeMemo },
        idempotencyKey: freshKey("tippay"),
      });
      setConfirm(false);
      if (result.receipt) setReceiptId(result.receipt.id);
      else setError(`The payment is ${result.payment.status} and was recorded as ${result.payment.mode}. No receipt was issued.`);
      router.refresh();
    } catch (caught) {
      setError(presentError(caught, "We couldn't record this tip. No receipt was created."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="stack"
      data-guide="tip-pay"
      onSubmit={(event) => {
        event.preventDefault();
        setConfirm(true);
      }}
    >
      <div className="row" data-guide="tip-amount">
        {suggested.map((value) => (
          <button className="quiet" type="button" key={value} onClick={() => setAmount(value)}>
            {value} ZEC
          </button>
        ))}
      </div>
      <label>
        Amount in ZEC
        <input value={amount} onChange={(event) => setAmount(event.target.value)} required inputMode="decimal" />
      </label>
      <label data-guide="tip-memo">
        Optional note
        <input value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={512} />
      </label>
      <label>
        <span>
          <input type="checkbox" checked={includeMemo} onChange={(event) => setIncludeMemo(event.target.checked)} /> Include the note on the receipt
        </span>
      </label>
      <HelpNote label="What the receipt will contain">
        The receipt can include the amount, network, and check level. The note is stored on it only if you check the box. A wallet link asks a wallet to pay and does not pay by itself.
      </HelpNote>
      <button type="submit">{practice ? "Review practice tip" : "Review tip"}</button>
      {receiptId ? <a href={`/receipts/${receiptId}`}>Open the receipt</a> : null}
      {error ? <p className="alert">{error}</p> : null}
      <ConfirmDialog
        open={confirm}
        title="Record this tip?"
        body={
          practice
            ? `${amount} ZEC will be recorded as a practice payment to the address on this page. ASH will not broadcast it. ${includeMemo ? "The note will be stored on the receipt." : "The note will be left off the receipt."}`
            : "ASH will try to record the payment check. A practice payment is refused in network-check mode, and this form does not submit a transaction id."
        }
        confirmLabel={practice ? "Record practice tip" : "Continue"}
        pending={pending}
        onClose={() => setConfirm(false)}
        onConfirm={pay}
      >
        <p className="mono">{address}</p>
      </ConfirmDialog>
    </form>
  );
}

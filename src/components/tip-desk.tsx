"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, freshKey } from "@/client/api";
import { ConfirmDialog } from "./confirm-dialog";
import { HelpNote } from "./help-note";
import { presentError } from "./labels";
import { useToast } from "./toast";
import { addressPlaceholder, sampleAddress, type Runtime } from "./runtime";
import { PaymentPanel, type PaymentRequestView } from "./payment-panel";
import { PayoutNotice } from "./payout-notice";

export function TipForm({ runtime, payout = null }: { runtime: Runtime; payout?: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const fixture = sampleAddress(runtime);
  const [title, setTitle] = useState("Studio jar");
  const [address, setAddress] = useState(fixture);
  const [statement, setStatement] = useState("Tips support the work. The receipt shows only the fields you select.");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const created = await api<{ operation: { id: string } }>("/api/ash/tips", {
        body: { title, address: runtime.practice ? address : payout ?? "", statement, suggestedZec: ["0.001", "0.01"] },
        idempotencyKey: freshKey("tip"),
      });
      toast("Tip page published. Share the link.");
      router.push(`/payments/tips/${created.operation.id}`);
      router.refresh();
    } catch (caught) {
      setError(presentError(caught, "We couldn't publish the tip page. Nothing was charged."));
      setPending(false);
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
      {runtime.practice ? null : <PayoutNotice runtime={runtime} payout={payout} />}
      <label data-guide="tip-address" hidden={!runtime.practice}>
        Shielded address that receives tips
        <input value={address} onChange={(event) => setAddress(event.target.value.trim())} required={runtime.practice} spellCheck={false} placeholder={addressPlaceholder(runtime)} autoComplete="off" />
        <span className="field-hint">
          {fixture && address === fixture
            ? "The sample address is an unfunded test fixture. Replace it before any real use. Publishing does not collect money."
            : `Use a ${runtime.network} shielded address from your wallet. Publishing does not collect money.`}
        </span>
      </label>
      <button type="submit" data-guide="tip-publish" disabled={pending || (!runtime.practice && !payout)}>
        {pending ? "Publishing" : "Publish tip page"}
      </button>
      {error ? <p className="alert">{error}</p> : null}
    </form>
  );
}

export function TipPay({ id, suggested, address, practice }: { id: string; suggested: string[]; address: string; uri?: string; practice: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [amount, setAmount] = useState(suggested[0] ?? "0.001");
  const [memo, setMemo] = useState("");
  const [includeMemo, setIncludeMemo] = useState(false);
  const [error, setError] = useState("");
  const [receiptId, setReceiptId] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [request, setRequest] = useState<PaymentRequestView | null>(null);

  async function pay() {
    setError("");
    setPending(true);
    try {
      const result = await api<{ receipt: { id: string } | null; request: PaymentRequestView | null }>(`/api/ash/tips/${id}/pay`, {
        body: { amountZec: amount, memo: memo || undefined, includeMemo },
        idempotencyKey: freshKey("tippay"),
      });
      setConfirm(false);
      if (result.receipt) {
        setReceiptId(result.receipt.id);
        toast("Tip recorded. Your receipt is ready.");
        router.refresh();
      } else if (result.request) {
        setRequest(result.request);
      }
    } catch (caught) {
      setError(presentError(caught, practice ? "We couldn't record this tip. No receipt was created." : "We couldn't create the payment request. Nothing was charged."));
    } finally {
      setPending(false);
    }
  }

  if (request) {
    return (
      <div className="stack" data-guide="tip-pay">
        <PaymentPanel
          request={request}
          onConfirmed={(done) => {
            if (done.resultRef) setReceiptId(done.resultRef);
            toast("Payment confirmed on chain. Your receipt is ready.");
            router.refresh();
          }}
        />
        {receiptId ? (
          <p className="banner ok">
            Tip confirmed. <a href={`/receipts/${receiptId}`}>Open the signed receipt</a>
          </p>
        ) : null}
        <button className="quiet" type="button" onClick={() => setRequest(null)}>
          Start a different tip
        </button>
      </div>
    );
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
      <div className="amount-chips" data-guide="tip-amount" role="group" aria-label="Suggested amounts">
        {suggested.map((value) => (
          <button className="amount-chip" type="button" key={value} onClick={() => setAmount(value)} aria-pressed={amount === value}>
            {value} <small>ZEC</small>
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
      <button type="submit">{practice ? "Review practice tip" : "Continue to payment"}</button>
      {receiptId ? (
        <p className="banner ok">
          Tip recorded. <a href={`/receipts/${receiptId}`}>Open the receipt</a>
        </p>
      ) : null}
      {error ? <p className="alert">{error}</p> : null}
      <ConfirmDialog
        open={confirm}
        title={practice ? "Record this tip?" : "Send this tip from your wallet?"}
        body={
          practice
            ? `${amount} ZEC will be recorded as a practice payment to the address on this page. ASH will not broadcast it. ${includeMemo ? "The note will be stored on the receipt." : "The note will be left off the receipt."}`
            : `ASH will create a payment request for ${amount} ZEC with a unique memo. You pay it from your own wallet, and ASH issues the receipt once the payment is confirmed on chain. ${includeMemo ? "Your note will be on the receipt." : ""}`
        }
        confirmLabel={practice ? "Record practice tip" : "Create payment request"}
        pending={pending}
        onClose={() => setConfirm(false)}
        onConfirm={pay}
      >
        <p className="mono">{address}</p>
      </ConfirmDialog>
    </form>
  );
}

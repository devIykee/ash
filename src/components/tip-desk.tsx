"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, freshKey } from "@/client/api";
import { ConfirmDialog } from "./confirm-dialog";
import { HelpNote } from "./help-note";
import { presentError } from "./labels";
import { useToast } from "./toast";
import { addressPlaceholder, sampleAddress, type Runtime } from "./runtime";
import { validTxId, WalletStep } from "./wallet-step";

export function TipForm({ runtime }: { runtime: Runtime }) {
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
        body: { title, address, statement, suggestedZec: ["0.001", "0.01"] },
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
      <label data-guide="tip-address">
        Shielded address that receives tips
        <input value={address} onChange={(event) => setAddress(event.target.value.trim())} required spellCheck={false} placeholder={addressPlaceholder(runtime)} autoComplete="off" />
        <span className="field-hint">
          {fixture && address === fixture
            ? "The sample address is an unfunded test fixture. Replace it before any real use. Publishing does not collect money."
            : `Use a ${runtime.network} shielded address from your wallet. Publishing does not collect money.`}
        </span>
      </label>
      <button type="submit" data-guide="tip-publish" disabled={pending}>
        {pending ? "Publishing" : "Publish tip page"}
      </button>
      {error ? <p className="alert">{error}</p> : null}
    </form>
  );
}

export function TipPay({ id, suggested, address, uri, practice }: { id: string; suggested: string[]; address: string; uri: string; practice: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [amount, setAmount] = useState(suggested[0] ?? "0.001");
  const [memo, setMemo] = useState("");
  const [includeMemo, setIncludeMemo] = useState(false);
  const [error, setError] = useState("");
  const [receiptId, setReceiptId] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [txId, setTxId] = useState("");
  const [info, setInfo] = useState("");
  // The wallet link follows the amount the supporter picked.
  const walletUri = /^\d+(\.\d{1,8})?$/.test(amount.trim()) && Number(amount) > 0 ? `zcash:${address}?amount=${amount.trim()}` : uri;

  async function pay() {
    setError("");
    setInfo("");
    setPending(true);
    try {
      const result = await api<{ receipt: { id: string } | null; payment: { status: string; mode: string } }>(`/api/ash/tips/${id}/pay`, {
        body: { amountZec: amount, memo: memo || undefined, includeMemo, txId: practice ? undefined : txId },
        idempotencyKey: freshKey("tippay"),
      });
      setConfirm(false);
      if (result.receipt) {
        setReceiptId(result.receipt.id);
        toast("Tip recorded. Your receipt is ready.");
      }
      else
        setInfo(
          result.payment.status === "observed"
            ? "A Zcash node sees this transaction. That does not show the amount or recipient, so no receipt was issued. The creator can confirm it in their wallet."
            : `The payment is ${result.payment.status}. No receipt was issued.`,
        );
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
      {practice ? null : <WalletStep uri={walletUri} address={address} amountZec={amount} txId={txId} onTxId={setTxId} />}
      <HelpNote label="What the receipt will contain">
        The receipt can include the amount, network, and check level. The note is stored on it only if you check the box. A wallet link asks a wallet to pay and does not pay by itself.
      </HelpNote>
      <button type="submit" disabled={!practice && !validTxId(txId)}>
        {practice ? "Review practice tip" : "Record my payment"}
      </button>
      {receiptId ? (
        <p className="banner ok">
          Tip recorded. <a href={`/receipts/${receiptId}`}>Open the receipt</a>
        </p>
      ) : null}
      {info ? <p className="banner">{info}</p> : null}
      {error ? <p className="alert">{error}</p> : null}
      <ConfirmDialog
        open={confirm}
        title="Record this tip?"
        body={
          practice
            ? `${amount} ZEC will be recorded as a practice payment to the address on this page. ASH will not broadcast it. ${includeMemo ? "The note will be stored on the receipt." : "The note will be left off the receipt."}`
            : `ASH will ask a Zcash node about transaction ${txId.slice(0, 10)}…. Seeing it does not prove the amount, so no receipt is issued for it.`
        }
        confirmLabel={practice ? "Record practice tip" : "Look up transaction"}
        pending={pending}
        onClose={() => setConfirm(false)}
        onConfirm={pay}
      >
        <p className="mono">{address}</p>
      </ConfirmDialog>
    </form>
  );
}

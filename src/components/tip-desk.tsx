"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, freshKey } from "@/client/api";

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
      setError(caught instanceof Error ? caught.message : "Could not publish.");
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>
      <label>
        Shielded address
        <input value={address} onChange={(event) => setAddress(event.target.value)} required spellCheck={false} />
      </label>
      <label>
        Statement
        <textarea value={statement} onChange={(event) => setStatement(event.target.value)} />
      </label>
      <button type="submit">Publish tip page</button>
      {error ? <p className="alert">{error}</p> : null}
    </form>
  );
}

export function TipPay({ id, suggested }: { id: string; suggested: string[] }) {
  const router = useRouter();
  const [amount, setAmount] = useState(suggested[0] ?? "0.001");
  const [memo, setMemo] = useState("");
  const [includeMemo, setIncludeMemo] = useState(false);
  const [error, setError] = useState("");
  const [receiptId, setReceiptId] = useState("");

  async function pay(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api<{ receipt: { id: string } | null; payment: { status: string; mode: string } }>(`/api/ash/tips/${id}/pay`, {
        body: { amountZec: amount, memo: memo || undefined, includeMemo },
        idempotencyKey: freshKey("tippay"),
      });
      if (result.receipt) setReceiptId(result.receipt.id);
      else setError(`Payment is ${result.payment.status} (${result.payment.mode}). No receipt was issued.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payment was not accepted.");
    }
  }

  return (
    <form className="stack" onSubmit={pay}>
      <div className="row">
        {suggested.map((value) => (
          <button className="quiet" type="button" key={value} onClick={() => setAmount(value)}>
            {value} ZEC
          </button>
        ))}
      </div>
      <label>
        Amount ZEC
        <input value={amount} onChange={(event) => setAmount(event.target.value)} required />
      </label>
      <label>
        Optional memo
        <input value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={512} />
      </label>
      <label>
        <span>
          <input type="checkbox" checked={includeMemo} onChange={(event) => setIncludeMemo(event.target.checked)} /> Include the memo on the receipt
        </span>
      </label>
      <button type="submit">Record simulated tip</button>
      <p className="muted">A ZIP-321 link asks a wallet to pay. This button uses the simulated adapter unless you are in chain mode.</p>
      {receiptId ? <a href={`/receipts/${receiptId}`}>Open receipt {receiptId}</a> : null}
      {error ? <p className="alert">{error}</p> : null}
    </form>
  );
}

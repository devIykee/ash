"use client";

import { CircleCheck, Copy, ExternalLink, Hourglass, Loader2, RadioTower } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { api } from "@/client/api";
import { zatoshiToZec } from "@/domain/money";
import { presentError } from "./labels";
import { validTxId } from "./wallet-step";

export type PaymentRequestView = {
  ref: string;
  network: "testnet" | "mainnet";
  address: string;
  amountZatoshi: string;
  memo: string;
  label: string;
  status: "open" | "confirming" | "confirmed";
  match: { txid: string; confirmations: number; height: number | null } | null;
  lastReason: string | null;
  uri: string;
  requiredConfirmations: number;
  resultRef: string | null;
};

function CopyRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-row">
      <span className="copy-label">{label}</span>
      <span className={mono ? "mono copy-value" : "copy-value"}>{value}</span>
      <button
        className="icon-button"
        type="button"
        aria-label={`Copy ${label.toLowerCase()}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <CircleCheck size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      </button>
    </div>
  );
}

/**
 * A real shielded payment request. The payer's wallet signs and broadcasts the transaction.
 * This panel shows what to pay and checks the chain until the payment is confirmed.
 */
export function PaymentPanel({ request: initial, onConfirmed }: { request: PaymentRequestView; onConfirmed?: (request: PaymentRequestView) => void }) {
  const [request, setRequest] = useState(initial);
  const [qr, setQr] = useState("");
  const [txId, setTxId] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const done = useRef(initial.status === "confirmed");
  const confirmedOnce = useRef(false);

  useEffect(() => {
    QRCode.toDataURL(request.uri, { margin: 1, width: 240, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch(() => setQr(""));
  }, [request.uri]);

  async function check(withTx?: string) {
    if (done.current) return;
    setChecking(true);
    setError("");
    try {
      const next = await api<PaymentRequestView>(`/api/ash/payment-requests/${request.ref}/check`, { body: withTx ? { txId: withTx } : {} });
      setRequest(next);
      if (next.status === "confirmed") {
        done.current = true;
        if (!confirmedOnce.current) {
          confirmedOnce.current = true;
          onConfirmed?.(next);
        }
      }
    } catch (caught) {
      setError(presentError(caught, "ASH could not check the network just now. It will try again."));
    } finally {
      setChecking(false);
    }
  }

  // Poll while the page is open: often enough to feel live, gentle on the network.
  useEffect(() => {
    if (done.current) return;
    void check();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, 12_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.ref]);

  const amount = zatoshiToZec(BigInt(request.amountZatoshi));
  const confirmations = request.match?.confirmations ?? 0;
  const net = request.network === "mainnet" ? "Zcash mainnet" : "Zcash testnet";

  if (request.status === "confirmed") {
    return (
      <div className="pay-panel" data-state="confirmed">
        <div className="pay-status ok">
          <CircleCheck size={22} aria-hidden="true" />
          <div>
            <strong>Payment confirmed on {net}</strong>
            <p className="muted">
              {amount} ZEC, {confirmations} confirmation{confirmations === 1 ? "" : "s"}. Verified with the payee&apos;s viewing key.
            </p>
          </div>
        </div>
        {request.match ? <CopyRow label="Transaction" value={request.match.txid} /> : null}
      </div>
    );
  }

  return (
    <div className="pay-panel" data-state={request.status}>
      <div className="pay-grid">
        <div className="pay-qr">
          {/* A generated data URL. next/image adds nothing here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr ? <img src={qr} alt={`QR code to pay ${amount} ZEC on ${net}`} width={200} height={200} /> : <div className="sk" style={{ width: 200, height: 200 }} />}
          <a className="button" href={request.uri}>
            <ExternalLink size={16} aria-hidden="true" /> Open in wallet
          </a>
        </div>
        <div className="pay-details">
          <p className="kicker">Pay with Zashi, YWallet, or any {net} wallet</p>
          <p className="pay-amount">
            {amount} <span>ZEC</span>
          </p>
          <CopyRow label="To" value={request.address} />
          <CopyRow label="Memo" value={request.memo} />
          <p className="field-hint">Include the memo exactly. It is how ASH knows this payment is yours. Your wallet signs and broadcasts the transaction. ASH never holds your keys.</p>
        </div>
      </div>
      <div className={request.status === "confirming" ? "pay-status seen" : "pay-status"} role="status" aria-live="polite">
        {request.status === "confirming" ? <RadioTower size={20} aria-hidden="true" /> : checking ? <Loader2 className="spin" size={20} aria-hidden="true" /> : <Hourglass size={20} aria-hidden="true" />}
        <div>
          <strong>
            {request.status === "confirming"
              ? request.match?.height === null
                ? "Payment seen. Waiting for the first block."
                : `Payment seen. ${confirmations} of ${request.requiredConfirmations} confirmations.`
              : "Waiting for your payment"}
          </strong>
          <p className="muted">
            {request.status === "confirming"
              ? "A Zcash block arrives about every 75 seconds. This updates by itself."
              : request.lastReason && !/No new blocks|has reached a block/.test(request.lastReason)
                ? request.lastReason
                : "ASH checks the network every few seconds after you send. Keep this page open, or come back later."}
          </p>
        </div>
      </div>
      <details className="pay-txid">
        <summary>Already sent? Paste the transaction id</summary>
        <form
          className="row"
          onSubmit={(event) => {
            event.preventDefault();
            if (validTxId(txId)) void check(txId.trim());
          }}
        >
          <input value={txId} onChange={(event) => setTxId(event.target.value.trim())} placeholder="64 hexadecimal characters" spellCheck={false} autoComplete="off" aria-label="Transaction id" />
          <button type="submit" className="small" disabled={!validTxId(txId) || checking}>
            Check
          </button>
        </form>
      </details>
      {error ? <p className="alert">{error}</p> : null}
    </div>
  );
}

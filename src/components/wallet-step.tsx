"use client";

import { useState } from "react";

const TX_RE = /^[0-9a-fA-F]{64}$/;

export function validTxId(value: string): boolean {
  return TX_RE.test(value.trim());
}

// Wallet-payment mode: ASH never sends money. The person pays from a wallet,
// then pastes the transaction id so ASH can ask a node whether it exists.
export function WalletStep({
  uri,
  address,
  amountZec,
  txId,
  onTxId,
  label = "Transaction id from your wallet",
}: {
  uri?: string | null;
  address?: string | null;
  amountZec?: string;
  txId: string;
  onTxId: (value: string) => void;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const invalid = txId.length > 0 && !validTxId(txId);

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="wallet-step">
      <ol>
        <li>
          {uri ? <a href={uri}>Open the payment in your wallet</a> : "Open your wallet"}
          {amountZec ? ` and send ${amountZec} ZEC.` : "."}
        </li>
        <li>Copy the transaction id your wallet shows after sending, and paste it below.</li>
      </ol>
      {address ? (
        <div className="row">
          <span className="mono muted address-line">{address}</span>
          <button className="quiet small" type="button" onClick={copy}>
            {copied ? "Copied" : "Copy address"}
          </button>
        </div>
      ) : null}
      <label>
        {label}
        <input
          value={txId}
          onChange={(event) => onTxId(event.target.value.trim())}
          placeholder="64 hexadecimal characters"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid}
          inputMode="text"
        />
        {invalid ? <span className="alert">A transaction id is 64 characters, 0 to 9 and a to f.</span> : null}
        <span className="field-hint">ASH asks a Zcash node whether this transaction exists. It cannot see a shielded amount or recipient, so seeing it does not unlock anything by itself.</span>
      </label>
    </div>
  );
}

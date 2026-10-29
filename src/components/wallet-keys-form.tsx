"use client";

import { KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/client/api";
import { ConfirmDialog } from "./confirm-dialog";
import { presentError } from "./labels";
import { useToast } from "./toast";

export type WalletKeyView = {
  network: "testnet" | "mainnet";
  enteredAddress: string;
  saplingAddress: string;
  source: string;
  canVerifyOutgoing: boolean;
  updatedAt: string;
};

const SOURCE: Record<string, string> = {
  unified_full: "Unified full viewing key",
  unified_incoming: "Unified incoming viewing key",
  sapling_extended_full: "Sapling full viewing key",
};

export function WalletKeyCard({ network, current, operator }: { network: "testnet" | "mainnet"; current: WalletKeyView | null; operator: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(!current);
  const [address, setAddress] = useState("");
  const [viewingKey, setViewingKey] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const label = network === "mainnet" ? "Mainnet" : "Testnet";

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await api("/api/ash/wallet-keys", { body: { network, address, viewingKey } });
      setViewingKey("");
      setAddress("");
      setEditing(false);
      toast(`${label} receiving key saved. ASH can now verify payments to you on ${network}.`);
      router.refresh();
    } catch (caught) {
      setError(presentError(caught, "That key could not be saved. Nothing was stored."));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel stack">
      <div className="section-head">
        <h2 className="row" style={{ gap: "0.5rem" }}>
          <KeyRound size={18} aria-hidden="true" /> {label}
        </h2>
        {current ? <span className="pill" data-state="ready">Verifying payments</span> : <span className="pill">Not set up</span>}
      </div>
      {current && !editing ? (
        <div className="stack" style={{ gap: "0.6rem" }}>
          <div className="copy-row" style={{ gridTemplateColumns: "6.5rem minmax(0,1fr)" }}>
            <span className="copy-label">Paid at</span>
            <span className="mono copy-value">{current.saplingAddress}</span>
          </div>
          <p className="muted" style={{ fontSize: "0.9rem" }}>
            {SOURCE[current.source] ?? current.source}.{" "}
            {current.canVerifyOutgoing ? "ASH can confirm payments you receive and payments you send (payroll)." : "ASH can confirm payments you receive. To confirm payroll you send, use a full viewing key."}
          </p>
          {operator && !current.canVerifyOutgoing ? <p className="banner">Payroll needs a full viewing key (uview… or zxview…) so ASH can confirm the payments you send.</p> : null}
          <div className="row">
            <button className="quiet small" type="button" onClick={() => setEditing(true)}>
              Replace key
            </button>
            <button className="quiet small" type="button" onClick={() => setConfirmRemove(true)}>
              <Trash2 size={15} aria-hidden="true" /> Remove
            </button>
          </div>
        </div>
      ) : (
        <form className="stack" onSubmit={save} style={{ maxWidth: "none" }}>
          <label>
            Receiving address on {network}
            <input value={address} onChange={(event) => setAddress(event.target.value.trim())} placeholder={network === "mainnet" ? "u1… or zs1…" : "utest1… or ztestsapling1…"} spellCheck={false} autoComplete="off" required />
            <span className="field-hint">A unified address must include a Sapling receiver. Payment requests use that Sapling receiver.</span>
          </label>
          <label>
            Viewing key for that address
            <textarea
              value={viewingKey}
              onChange={(event) => setViewingKey(event.target.value.trim())}
              placeholder={network === "mainnet" ? "uview1…, uivk1…, or zxviews1…" : "uviewtest1…, uivktest1…, or zxviewtestsapling1…"}
              spellCheck={false}
              autoComplete="off"
              style={{ minHeight: "5.5rem" }}
              required
            />
            <span className="field-hint">
              {operator ? "Use a full viewing key so ASH can also confirm payroll you send. " : ""}Never paste a seed phrase or spending key. ASH rejects them.
            </span>
          </label>
          <div className="row">
            <button type="submit" disabled={pending || !address || !viewingKey}>
              <ShieldCheck size={16} aria-hidden="true" /> {pending ? "Checking" : "Check and save"}
            </button>
            {current ? (
              <button className="quiet" type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
            ) : null}
          </div>
          {error ? <p className="alert">{error}</p> : null}
        </form>
      )}
      <ConfirmDialog
        open={confirmRemove}
        title={`Remove your ${label.toLowerCase()} key?`}
        body="ASH stops verifying new payments to you on this network. Offers, plans, and tip pages that use this address stay published, but their payments cannot be confirmed until you add a key again."
        confirmLabel="Remove key"
        pending={pending}
        onClose={() => setConfirmRemove(false)}
        onConfirm={async () => {
          setPending(true);
          try {
            await api(`/api/ash/wallet-keys/${network}`, { method: "DELETE" });
            setConfirmRemove(false);
            toast(`${label} key removed.`);
            router.refresh();
          } catch (caught) {
            setError(presentError(caught, "Could not remove the key."));
          } finally {
            setPending(false);
          }
        }}
      />
    </section>
  );
}

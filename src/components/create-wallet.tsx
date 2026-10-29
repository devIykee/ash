"use client";

import { Copy, Download, ShieldAlert, Sparkles, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/client/api";
import { presentError } from "./labels";
import { useToast } from "./toast";

type Created = { phrase: string; address: string; viewingKey: string; birthday: number | null };

/**
 * Creates a Zcash wallet in this browser. The recovery phrase is shown once and never sent to
 * ASH. Only the address and viewing key are saved, exactly as if the person pasted them.
 */
export function CreateWallet({ network, onCancel, onDone }: { network: "testnet" | "mainnet"; onCancel?: () => void; onDone?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [wallet, setWallet] = useState<Created | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const label = network === "mainnet" ? "mainnet" : "testnet";

  async function create() {
    setPending(true);
    setError("");
    try {
      // Loaded on demand so the key maths stays out of every other page.
      const { createWallet } = await import("@/zcash/wallet-create");
      const [made, tip] = await Promise.all([
        createWallet(network),
        fetch(`/api/ash/chain/height?network=${network}`)
          .then((r) => r.json() as Promise<{ height: number | null }>)
          .catch(() => ({ height: null })),
      ]);
      // A small margin before the current tip, so a restore never starts after the first payment.
      setWallet({ ...made, birthday: tip.height ? tip.height - 100 : null });
    } catch (caught) {
      setError(presentError(caught, "The wallet could not be created in this browser."));
    } finally {
      setPending(false);
    }
  }

  function backupText(w: Created): string {
    return [
      `ASH ${label} wallet backup`,
      `Created ${new Date().toISOString()}`,
      "",
      "Recovery phrase (keep secret, never share):",
      w.phrase,
      "",
      `Wallet birthday height: ${w.birthday ?? "unknown"}`,
      `Receiving address: ${w.address}`,
      "",
      "Restore: in Zashi or YWallet choose Restore, enter the 24 words, and the birthday height.",
      network === "testnet" ? "Use a wallet set to Zcash testnet." : "",
    ].join("\n");
  }

  function download(w: Created) {
    const url = URL.createObjectURL(new Blob([backupText(w)], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ash-${label}-wallet-backup.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function use() {
    if (!wallet) return;
    setPending(true);
    setError("");
    try {
      await api("/api/ash/wallet-keys", { body: { network, address: wallet.address, viewingKey: wallet.viewingKey } });
      setWallet(null);
      toast(`New ${label} wallet saved. ASH can now verify payments to it.`);
      onDone?.();
      router.refresh();
    } catch (caught) {
      setError(presentError(caught, "The wallet could not be saved. Your phrase still works; try again."));
    } finally {
      setPending(false);
    }
  }

  if (!wallet) {
    return (
      <div className="create-wallet stack">
        <div className="row" style={{ gap: "0.6rem" }}>
          <span className="tile-icon" aria-hidden="true">
            <Sparkles size={18} />
          </span>
          <div>
            <strong>Don&apos;t have a {label} wallet?</strong>
            <p className="muted" style={{ fontSize: "0.9rem" }}>
              Create one here. It is made in this browser and you keep the recovery phrase. ASH only receives the address and a viewing key.
            </p>
          </div>
        </div>
        <div className="row">
          <button type="button" onClick={create} disabled={pending}>
            <Wallet size={16} aria-hidden="true" /> {pending ? "Creating" : `Create a ${label} wallet`}
          </button>
          {onCancel ? (
            <button className="quiet" type="button" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
        </div>
        {error ? <p className="alert">{error}</p> : null}
      </div>
    );
  }

  const words = wallet.phrase.split(" ");
  return (
    <div className="create-wallet stack">
      <p className="banner danger">
        <strong>Write these 24 words down now.</strong> They are the only way to spend money sent to this wallet. ASH never sees them and cannot recover them. Anyone who has them can take the funds.
      </p>
      <ol className="seed-grid" aria-label="Recovery phrase">
        {words.map((word, index) => (
          <li key={index}>
            <span>{index + 1}</span>
            {word}
          </li>
        ))}
      </ol>
      <div className="row">
        <button className="quiet small" type="button" onClick={() => download(wallet)}>
          <Download size={15} aria-hidden="true" /> Download backup file
        </button>
        <button
          className="quiet small"
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(wallet.phrase);
              toast("Recovery phrase copied. Clear your clipboard after saving it.");
            } catch {
              toast("Could not copy. Write the words down instead.", "error");
            }
          }}
        >
          <Copy size={15} aria-hidden="true" /> Copy phrase
        </button>
      </div>
      <div className="copy-row" style={{ gridTemplateColumns: "7rem minmax(0,1fr)" }}>
        <span className="copy-label">Address</span>
        <span className="mono copy-value">{wallet.address}</span>
      </div>
      <div className="copy-row" style={{ gridTemplateColumns: "7rem minmax(0,1fr)" }}>
        <span className="copy-label">Birthday height</span>
        <span className="mono copy-value">{wallet.birthday ?? "Unknown. A restore will scan from the start, which is slower."}</span>
      </div>
      <p className="field-hint">
        To spend, restore the 24 words in Zashi or YWallet{network === "testnet" ? " (set to testnet)" : ""} and enter the birthday height. The wallet is a standard Zcash account (ZIP 32, account 0).
      </p>
      <label>
        <span>
          <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} /> I saved my recovery phrase somewhere safe
        </span>
      </label>
      <div className="row">
        <button type="button" onClick={use} disabled={!saved || pending}>
          <ShieldAlert size={16} aria-hidden="true" /> {pending ? "Saving" : "Use this wallet"}
        </button>
        <button
          className="quiet"
          type="button"
          onClick={() => {
            setWallet(null);
            setSaved(false);
          }}
          disabled={pending}
        >
          Discard
        </button>
      </div>
      {error ? <p className="alert">{error}</p> : null}
    </div>
  );
}

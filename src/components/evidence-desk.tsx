"use client";

import { useState } from "react";
import { generateX25519 } from "@/crypto/box";
import { decryptEvidence, verifyEvidence, type EncryptedEvidence, type SealedEvidence } from "@/evidence/format";
import { api } from "@/client/api";
import { ConfirmDialog } from "./confirm-dialog";
import { presentError } from "./labels";

export function EvidenceExport({ operationId }: { operationId: string }) {
  const [pack, setPack] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [choice, setChoice] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  async function build(encrypt: boolean) {
    setError("");
    setPending(true);
    try {
      let arbiterPublicKey: string | undefined;
      let privateKey = "";
      if (encrypt) {
        const key = generateX25519();
        arbiterPublicKey = key.publicKey;
        privateKey = key.privateKey;
      }
      const result = await api<{ pack: SealedEvidence; encrypted?: EncryptedEvidence }>("/api/ash/evidence", {
        body: { operationId, arbiterPublicKey },
      });
      setPack(JSON.stringify(encrypt ? result.encrypted : result.pack, null, 2));
      setSecret(privateKey);
      setChoice(null);
    } catch (caught) {
      setError(presentError(caught, "We couldn't prepare the evidence package. Nothing was shared."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack" data-guide="evidence-export">
      <div className="row">
        <button type="button" onClick={() => setChoice(false)}>
          Prepare evidence
        </button>
        <button className="quiet" type="button" onClick={() => setChoice(true)}>
          Prepare a package for a reviewer
        </button>
      </div>
      <p className="muted">The package can include the status, payment mode, transaction reference, and event list. A signature binds these bytes. It does not make a claim true. Nothing is sent until you share the text yourself.</p>
      <ConfirmDialog
        open={choice !== null}
        title={choice ? "Create a reviewer key?" : "Prepare this evidence package?"}
        body={
          choice
            ? "ASH will encrypt the package to a new key created in this browser. The private key is shown once and is not stored by ASH. Copy it before you leave."
            : "The package will appear on this page. It can contain names, amounts, and the event history already stored for this activity. ASH does not send it anywhere."
        }
        confirmLabel={choice ? "Create the package" : "Show the package"}
        pending={pending}
        onClose={() => setChoice(null)}
        onConfirm={() => build(Boolean(choice))}
      />
      {secret ? (
        <label>
          Reviewer private key, shown once and not stored by ASH
          <textarea readOnly value={secret} />
        </label>
      ) : null}
      {pack ? <pre>{pack}</pre> : null}
      {error ? <p className="alert">{error}</p> : null}
    </div>
  );
}

export function EvidenceVerify() {
  const [raw, setRaw] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function verify() {
    setError("");
    setResult("");
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") throw new Error("Evidence JSON must be an object.");
      const format = "format" in parsed ? String((parsed as { format?: unknown }).format) : "";
      if (format === "ash-evidence-sealed-v1") {
        if (!privateKey) throw new Error("Paste the reviewer private key to open this package in the browser.");
        const opened = decryptEvidence(parsed as EncryptedEvidence, privateKey.trim());
        const verdict = verifyEvidence(opened);
        setResult(`${verdict.valid ? "The signature matches these bytes." : "Rejected."} ${verdict.reason}`);
        return;
      }
      const verdict = await api<{ valid: boolean; reason: string }>("/api/ash/evidence/verify", { body: { pack: parsed } });
      setResult(`${verdict.valid ? "The signature matches these bytes." : "Rejected."} ${verdict.reason}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't check that package.");
    }
  }

  return (
    <div className="stack">
      <label>
        Evidence package
        <textarea value={raw} onChange={(event) => setRaw(event.target.value)} />
      </label>
      <label>
        Reviewer private key, only for an encrypted package
        <input value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} spellCheck={false} />
      </label>
      <button type="button" onClick={verify} data-guide="evidence-verify">
        Check the signature
      </button>
      {result ? <p className="banner ok">{result}</p> : null}
      {error ? <p className="alert">{error}</p> : null}
    </div>
  );
}

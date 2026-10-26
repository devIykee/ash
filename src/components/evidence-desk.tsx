"use client";

import { useState } from "react";
import { generateX25519 } from "@/crypto/box";
import { decryptEvidence, verifyEvidence, type EncryptedEvidence, type SealedEvidence } from "@/evidence/format";
import { api } from "@/client/api";

export function EvidenceExport({ operationId }: { operationId: string }) {
  const [pack, setPack] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");

  async function build(encrypt: boolean) {
    setError("");
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not seal evidence.");
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <button type="button" onClick={() => build(false)}>
          Seal evidence
        </button>
        <button className="quiet" type="button" onClick={() => build(true)}>
          Seal for a new arbiter key
        </button>
      </div>
      <p className="muted">Review the JSON before you share it. A signature binds these bytes. It does not make a claim true.</p>
      {secret ? (
        <label>
          Arbiter private key, shown once and not stored by ASH
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
        if (!privateKey) throw new Error("Paste the arbiter private key to open this package locally.");
        const opened = decryptEvidence(parsed as EncryptedEvidence, privateKey.trim());
        const verdict = verifyEvidence(opened);
        setResult(`${verdict.valid ? "Signature matches" : "Rejected"}: ${verdict.reason}`);
        return;
      }
      const verdict = await api<{ valid: boolean; reason: string }>("/api/ash/evidence/verify", { body: { pack: parsed } });
      setResult(`${verdict.valid ? "Signature matches" : "Rejected"}: ${verdict.reason}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not verify.");
    }
  }

  return (
    <div className="stack">
      <label>
        Evidence JSON
        <textarea value={raw} onChange={(event) => setRaw(event.target.value)} />
      </label>
      <label>
        Arbiter private key, only for an encrypted package
        <input value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} spellCheck={false} />
      </label>
      <button type="button" onClick={verify}>
        Verify
      </button>
      {result ? <p className="banner ok">{result}</p> : null}
      {error ? <p className="alert">{error}</p> : null}
    </div>
  );
}

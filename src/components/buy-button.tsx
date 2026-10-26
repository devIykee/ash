"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { generateX25519, publicFromPrivate } from "@/crypto/box";
import { api, freshKey } from "@/client/api";

export function BuyButton({ offerId, disabled }: { offerId: string; disabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function buy() {
    setPending(true);
    setError("");
    try {
      let privateKey = localStorage.getItem("ash-device-private");
      if (!privateKey) {
        const created = generateX25519();
        privateKey = created.privateKey;
        localStorage.setItem("ash-device-private", privateKey);
      }
      await api("/api/ash/keys", { body: { publicKey: publicFromPrivate(privateKey) } });
      const opened = await api<{ operation: { id: string } }>("/api/ash/exchanges", {
        body: { offerId },
        idempotencyKey: freshKey("buy"),
      });
      router.push(`/commerce/exchanges/${opened.operation.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open the exchange.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack">
      <button type="button" onClick={buy} disabled={disabled || pending}>
        {pending ? "Opening" : "Start purchase"}
      </button>
      <p className="muted">This registers an X25519 key from this browser. It does not pay yet.</p>
      {error ? <p className="alert">{error}</p> : null}
    </div>
  );
}

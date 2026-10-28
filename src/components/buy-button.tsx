"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { generateX25519, publicFromPrivate } from "@/crypto/box";
import { api, freshKey } from "@/client/api";
import { storage } from "@/client/storage";
import { ConfirmDialog } from "./confirm-dialog";
import { presentError } from "./labels";

export function BuyButton({ offerId, disabled, title, price }: { offerId: string; disabled: boolean; title: string; price: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function buy() {
    setPending(true);
    setError("");
    try {
      let privateKey = storage.get("ash-device-private");
      if (!privateKey) {
        const created = generateX25519();
        privateKey = created.privateKey;
        if (!storage.set("ash-device-private", privateKey)) {
          throw new Error("This browser blocks site storage, so it cannot keep the key that opens the file. Use a normal window and try again.");
        }
      }
      await api("/api/ash/keys", { body: { publicKey: publicFromPrivate(privateKey) } });
      const opened = await api<{ operation: { id: string } }>("/api/ash/exchanges", {
        body: { offerId },
        idempotencyKey: freshKey("buy"),
      });
      setConfirm(false);
      router.push(`/commerce/exchanges/${opened.operation.id}`);
      router.refresh();
    } catch (caught) {
      setError(presentError(caught, "We couldn't open the exchange. No payment was recorded."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack" data-guide="offer-buy">
      <button type="button" onClick={() => setConfirm(true)} disabled={disabled || pending}>
        {pending ? "Opening" : "Start purchase"}
      </button>
      <p className="muted">This creates an encryption key in this browser. It does not pay.</p>
      {error ? <p className="alert">{error}</p> : null}
      <ConfirmDialog
        open={confirm}
        title="Start this purchase?"
        body={`You are opening an exchange for ${title} at ${price}. ASH will store an encryption address from this browser. Payment happens later, after the sender allows delivery.`}
        confirmLabel="Open the exchange"
        pending={pending}
        onClose={() => setConfirm(false)}
        onConfirm={buy}
      />
    </div>
  );
}

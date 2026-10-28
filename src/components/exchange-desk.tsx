"use client";

import { hexToBytes } from "@noble/hashes/utils.js";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { openBox, sealTo, type SealedBox } from "@/crypto/box";
import { decryptPack, type AshPack } from "@/crypto/pack";
import { combineShares, shareFromJson, shareToJson, splitSecret } from "@/crypto/shamir";
import { zatoshiToZec } from "@/domain/money";
import { api, freshKey } from "@/client/api";
import { storage } from "@/client/storage";
import { ConfirmDialog } from "./confirm-dialog";
import { HelpNote } from "./help-note";
import { presentError } from "./labels";
import { useToast } from "./toast";
import { validTxId, WalletStep } from "./wallet-step";
import { sha256Hex } from "@/crypto/pack";

type Desk = {
  id: string;
  version: number;
  state: string;
  role: "seller" | "buyer" | "other";
  offerId: string;
  priceZatoshi: string;
  buyerPublicKey?: string;
  releaseReady: boolean;
  practice: boolean;
  walletUri?: string | null;
  payTo?: string | null;
  fileName?: string | null;
};

export function ExchangeDesk(props: Desk) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pastedKey, setPastedKey] = useState("");
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<"release" | "pay" | "fail" | null>(null);
  const [txId, setTxId] = useState("");

  async function run(work: () => Promise<void>, message?: string) {
    setPending(true);
    setError("");
    try {
      await work();
      setConfirm(null);
      if (message) toast(message);
      router.refresh();
    } catch (caught) {
      setError(presentError(caught, "We couldn't complete that step. The file was not opened."));
    } finally {
      setPending(false);
    }
  }

  function contentKey(): Uint8Array {
    const saved = storage.get(`ash-content-key:${props.offerId}`);
    const stored = pastedKey.trim() || saved || "";
    if (!/^[0-9a-f]{64}$/.test(stored)) throw new Error("Paste the file key saved when the offer was published. It is 64 hexadecimal characters.");
    return hexToBytes(stored);
  }

  function deviceKey(): string {
    const stored = storage.get("ash-device-private");
    if (!stored) throw new Error("This browser has no encryption key. Start the purchase again from the same browser.");
    return stored;
  }

  async function release() {
    if (!props.buyerPublicKey) throw new Error("The buyer key is not available.");
    const shares = splitSecret(contentKey());
    await api(`/api/ash/exchanges/${props.id}/release`, {
      body: {
        expectedVersion: props.version,
        buyerShareEnvelope: sealTo(props.buyerPublicKey, shares[0].bytes),
        releaseEnvelope: sealTo(props.buyerPublicKey, shares[1].bytes),
        mediatorShare: shareToJson(shares[2]),
      },
    });
  }

  async function pay() {
    await api(`/api/ash/exchanges/${props.id}/pay`, {
      body: { expectedVersion: props.version, txId: props.practice ? undefined : txId },
      idempotencyKey: freshKey("pay"),
    });
  }

  async function download(mode: "release" | "recover") {
    const pack = await api<{
      paid: boolean;
      pack: AshPack | null;
      buyerShareEnvelope: SealedBox | null;
      releaseEnvelope: SealedBox | null;
      plaintextSha256: string;
    }>(`/api/ash/exchanges/${props.id}/package`);
    if (!pack.buyerShareEnvelope) throw new Error("The sender has not allowed delivery yet.");
    const share1 = openBox(deviceKey(), pack.buyerShareEnvelope);
    let key: Uint8Array;
    if (mode === "recover") {
      const recovered = await api<{ mediatorShare: { index: number; bytes: string }; buyerShareEnvelope: SealedBox | null }>(
        `/api/ash/exchanges/${props.id}/recover`,
        { method: "POST", body: {} },
      );
      key = combineShares([
        { index: 1, bytes: share1 },
        shareFromJson(recovered.mediatorShare),
      ]);
    } else {
      if (!pack.paid || !pack.releaseEnvelope || !pack.pack) throw new Error("The payment is not accepted yet, so the file stays locked.");
      key = combineShares([
        { index: 1, bytes: share1 },
        { index: 2, bytes: openBox(deviceKey(), pack.releaseEnvelope) },
      ]);
    }
    if (!pack.pack) throw new Error("The encrypted package is not available.");
    const plain = decryptPack(pack.pack, key);
    if (sha256Hex(plain) !== pack.plaintextSha256) {
      throw new Error("The opened file does not match the published fingerprint. It was not saved. Report a failed delivery.");
    }
    const blob = new Blob([Uint8Array.from(plain)]);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = props.fileName || "ash-delivery.bin";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setInfo("Opened in this browser and saved as a download. It matches the published fingerprint.");
  }

  return (
    <div className="stack">
      <p className="muted">
        Price {zatoshiToZec(BigInt(props.priceZatoshi))} ZEC. ASH stores the encrypted file and one part of the file key. It cannot read the file.
      </p>
      <HelpNote label="What happens if this fails">
        Allowing delivery does not move money. Recording a payment does not refund itself. Reporting a failed delivery does not reverse the payment. Recovery uses the key part ASH stored, plus the part sealed for this browser.
      </HelpNote>
      {props.role === "seller" && props.state === "awaiting_seller" ? (
        <div className="stack" data-guide="exchange-release">
          <label>
            File key, if it is not saved in this browser
            <input value={pastedKey} onChange={(event) => setPastedKey(event.target.value)} spellCheck={false} placeholder="64 hex characters" />
          </label>
          <button type="button" disabled={pending} onClick={() => setConfirm("release")}>
            Allow delivery
          </button>
        </div>
      ) : null}
      {props.role === "buyer" && props.state === "awaiting_seller" ? (
        <p className="banner">Waiting for the seller to allow delivery. You pay after that. Nothing has been charged.</p>
      ) : null}
      {props.role === "seller" && ["awaiting_payment", "payment_observed"].includes(props.state) ? (
        <p className="banner">Delivery is allowed. The buyer pays next. The file stays locked until ASH accepts the payment.</p>
      ) : null}
      {props.role === "buyer" && props.state === "payment_observed" ? (
        <p className="banner">
          A Zcash node sees your transaction. ASH cannot see a shielded amount or recipient, so the file stays locked. The seller can confirm the payment in their wallet.
        </p>
      ) : null}
      {props.role === "buyer" && props.state === "awaiting_payment" ? (
        <div className="stack" data-guide="exchange-pay">
          {props.practice ? null : (
            <WalletStep uri={props.walletUri} address={props.payTo} amountZec={zatoshiToZec(BigInt(props.priceZatoshi))} txId={txId} onTxId={setTxId} />
          )}
          {!props.practice && !props.payTo ? <p className="alert">This offer has no receiving address, so it cannot be paid from a wallet.</p> : null}
          <button type="button" disabled={pending || (!props.practice && !validTxId(txId))} onClick={() => setConfirm("pay")}>
            {props.practice ? "Review practice payment" : "Record my payment"}
          </button>
        </div>
      ) : null}
      {props.role === "buyer" && ["payment_verified", "delivered", "completed", "recovered"].includes(props.state) ? (
        <button type="button" disabled={pending} data-guide="exchange-download" onClick={() => run(() => download("release"))}>
          Open and download
        </button>
      ) : null}
      {props.role === "buyer" && props.state === "payment_verified" ? (
        <button className="quiet" type="button" disabled={pending} onClick={() => run(() => api(`/api/ash/exchanges/${props.id}/ack`, { body: { expectedVersion: props.version } }).then(() => undefined), "Exchange marked finished.")}>
          Mark finished
        </button>
      ) : null}
      {props.role === "buyer" && props.state === "payment_verified" ? (
        <button className="danger" type="button" disabled={pending} data-guide="exchange-fail" onClick={() => setConfirm("fail")}>
          Report failed delivery
        </button>
      ) : null}
      {props.role === "buyer" && (props.state === "delivery_failed" || props.state === "recovered") ? (
        <button type="button" disabled={pending} data-guide="exchange-recover" onClick={() => run(() => download("recover"))}>
          Recover with the stored key part
        </button>
      ) : null}
      <ConfirmDialog
        open={confirm === "release"}
        title="Allow delivery?"
        body="This seals key parts for the buyer and stores one part with ASH. ASH still cannot read the file. You can do this only while the exchange is waiting for you. It does not collect the payment."
        confirmLabel="Allow delivery"
        pending={pending}
        onClose={() => setConfirm(null)}
        onConfirm={() => run(release, "Delivery allowed. The buyer can pay now.")}
      />
      <ConfirmDialog
        open={confirm === "pay"}
        title="Record this payment?"
        body={
          props.practice
            ? `This records a practice payment of ${zatoshiToZec(BigInt(props.priceZatoshi))} ZEC. It is not broadcast. The file stays locked until ASH accepts the payment.`
            : `ASH will ask a Zcash node about transaction ${txId.slice(0, 10)}…. Seeing it does not prove the amount, so the file stays locked until the payment is accepted.`
        }
        confirmLabel={props.practice ? "Record practice payment" : "Look up transaction"}
        pending={pending}
        onClose={() => setConfirm(null)}
        onConfirm={() => run(pay, props.practice ? "Payment recorded. You can open the file." : "Transaction looked up.")}
      />
      <ConfirmDialog
        open={confirm === "fail"}
        title="Report that delivery failed?"
        body="This marks the exchange as a failed delivery. It does not reverse the payment. You can then try the key part ASH stored."
        confirmLabel="Report failed delivery"
        pending={pending}
        onClose={() => setConfirm(null)}
        onConfirm={() => run(() => api(`/api/ash/exchanges/${props.id}/fail`, { body: { expectedVersion: props.version } }).then(() => undefined))}
      />
      {info ? <p className="banner ok">{info}</p> : null}
      {error ? <p className="alert">{error}</p> : null}
    </div>
  );
}

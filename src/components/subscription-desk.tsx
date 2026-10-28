"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, freshKey } from "@/client/api";
import { ConfirmDialog } from "./confirm-dialog";
import { presentError } from "./labels";
import { useToast } from "./toast";
import { addressPlaceholder, sampleAddress, type Runtime } from "./runtime";
import { validTxId, WalletStep } from "./wallet-step";

export function PlanForm({ runtime }: { runtime: Runtime }) {
  const router = useRouter();
  const toast = useToast();
  const fixture = sampleAddress(runtime);
  const [title, setTitle] = useState("Research feed");
  const [description, setDescription] = useState("A renewal, not an automatic debit.");
  const [price, setPrice] = useState("0.001");
  const [payTo, setPayTo] = useState(fixture);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await api("/api/ash/plans", { body: { title, description, priceZec: price, payTo: payTo.trim() || undefined, intervalDays: 30, graceDays: 3 } });
      toast(`${title} is published.`);
      router.refresh();
    } catch (caught) {
      setError(presentError(caught, "We couldn't publish the plan. Nobody was charged."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>
      <label>
        Description
        <input value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <label>
        Price in ZEC
        <input value={price} onChange={(event) => setPrice(event.target.value)} required inputMode="decimal" />
      </label>
      <label>
        Shielded address that receives renewals{runtime.practice ? " (optional)" : ""}
        <input value={payTo} onChange={(event) => setPayTo(event.target.value.trim())} spellCheck={false} autoComplete="off" placeholder={addressPlaceholder(runtime)} required={!runtime.practice} />
        {fixture && payTo === fixture ? <span className="field-hint">The sample address is an unfunded test fixture.</span> : null}
      </label>
      <p className="field-hint">The period is 30 days, with 3 days of grace. Publishing a plan does not charge anyone.</p>
      <button type="submit" disabled={pending}>
        {pending ? "Publishing" : "Publish plan"}
      </button>
      {error ? <p className="alert">{error}</p> : null}
    </form>
  );
}

export function SubscribeButton({ offerId, title, price }: { offerId: string; title: string; price: string }) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Review subscription
      </button>
      {error ? <p className="alert">{error}</p> : null}
      <ConfirmDialog
        open={open}
        title={`Subscribe to ${title}?`}
        body={`The price is ${price} ZEC per period. Subscribing does not charge you. You pay for the first period in the next step, and every later period is a payment you confirm yourself.`}
        confirmLabel="Subscribe"
        pending={pending}
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          setPending(true);
          setError("");
          try {
            await api("/api/ash/subscriptions", { body: { offerId }, idempotencyKey: freshKey("sub") });
            setOpen(false);
            toast("Subscribed. Pay for the first period below.");
            router.refresh();
          } catch (caught) {
            setError(presentError(caught, "We couldn't start the subscription. Check whether a payment was recorded before trying again."));
          } finally {
            setPending(false);
          }
        }}
      />
    </div>
  );
}

export function SubscriptionActions({
  id,
  version,
  practice,
  state,
  price,
  walletUri,
  payTo,
}: {
  id: string;
  version: number;
  practice: boolean;
  state: string;
  price: string;
  walletUri?: string | null;
  payTo?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<"renew" | "cancel" | null>(null);
  const [txId, setTxId] = useState("");
  const [paying, setPaying] = useState(false);
  const first = state === "awaiting_payment";
  const cancelled = state === "cancelled";

  async function post(path: string, withVersion: boolean, extra: Record<string, unknown> = {}) {
    setError("");
    setPending(true);
    try {
      await api(path, withVersion ? { body: { expectedVersion: version, ...extra }, idempotencyKey: freshKey("subact") } : { method: "POST", body: {} });
      setTxId("");
      setPaying(false);
      toast(path.endsWith("/cancel") ? "Future renewals cancelled." : path.endsWith("/refresh") ? "Period checked." : practice ? "Payment recorded." : "Transaction looked up.");
      setConfirm(null);
      router.refresh();
    } catch (caught) {
      setError(presentError(caught, "We couldn't update the subscription. Reload it before trying again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack">
      {cancelled ? <p className="muted">Cancelled. The record is kept, and it will not renew.</p> : null}
      {!cancelled && !practice && paying ? (
        <WalletStep uri={walletUri} address={payTo} amountZec={price} txId={txId} onTxId={setTxId} />
      ) : null}
      {!cancelled && !practice && !payTo ? <p className="alert">This plan has no receiving address, so it cannot be paid from a wallet.</p> : null}
      {cancelled ? null : (
        <div className="row">
          {practice || paying ? (
            <button type="button" onClick={() => setConfirm("renew")} disabled={pending || (!practice && !validTxId(txId))}>
              {practice ? (first ? "Pay first period" : "Renew now") : "Record my payment"}
            </button>
          ) : (
            <button type="button" onClick={() => setPaying(true)} disabled={pending || !payTo}>
              {first ? "Pay first period" : "Renew now"}
            </button>
          )}
          {first ? null : (
            <button className="quiet" type="button" onClick={() => post(`/api/ash/subscriptions/${id}/refresh`, false)} disabled={pending}>
              Check the period
            </button>
          )}
          <button className="quiet" type="button" onClick={() => setConfirm("cancel")} disabled={pending}>
            {first ? "Cancel" : "Cancel future renewals"}
          </button>
        </div>
      )}
      {error ? <p className="alert">{error}</p> : null}
      <ConfirmDialog
        open={confirm === "renew"}
        title={first ? "Pay for the first period?" : "Renew for another period?"}
        body={
          practice
            ? `This records a practice payment of ${price} ZEC. It does not approve any period after this one. Each renewal asks for its own confirmation.`
            : `ASH will ask a Zcash node about transaction ${txId.slice(0, 10)}…. Seeing it does not prove the amount, so access starts only after the payment is accepted.`
        }
        confirmLabel={practice ? (first ? "Pay first period" : "Renew now") : "Look up transaction"}
        pending={pending}
        onClose={() => setConfirm(null)}
        onConfirm={() => post(`/api/ash/subscriptions/${id}/renew`, true, practice ? {} : { txId })}
      />
      <ConfirmDialog
        open={confirm === "cancel"}
        title="Cancel future renewals?"
        body="This stops later renewals and keeps the record. It does not reverse a payment that already succeeded."
        confirmLabel="Cancel future renewals"
        pending={pending}
        onClose={() => setConfirm(null)}
        onConfirm={() => post(`/api/ash/subscriptions/${id}/cancel`, true)}
      />
    </div>
  );
}

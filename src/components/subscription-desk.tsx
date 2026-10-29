"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, freshKey } from "@/client/api";
import { ConfirmDialog } from "./confirm-dialog";
import { presentError } from "./labels";
import { useToast } from "./toast";
import { addressPlaceholder, sampleAddress, type Runtime } from "./runtime";
import { PaymentPanel, type PaymentRequestView } from "./payment-panel";
import { PayoutNotice } from "./payout-notice";

export function PlanForm({ runtime, payout = null }: { runtime: Runtime; payout?: string | null }) {
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
      await api("/api/ash/plans", { body: { title, description, priceZec: price, payTo: runtime.practice ? payTo.trim() || undefined : undefined, intervalDays: 30, graceDays: 3 } });
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
      {runtime.practice ? null : <PayoutNotice runtime={runtime} payout={payout} />}
      <label hidden={!runtime.practice}>
        Shielded address that receives renewals (optional)
        <input value={payTo} onChange={(event) => setPayTo(event.target.value.trim())} spellCheck={false} autoComplete="off" placeholder={addressPlaceholder(runtime)} />
        {fixture && payTo === fixture ? <span className="field-hint">The sample address is an unfunded test fixture.</span> : null}
      </label>
      <p className="field-hint">The period is 30 days, with 3 days of grace. Publishing a plan does not charge anyone.</p>
      <button type="submit" disabled={pending || (!runtime.practice && !payout)}>
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
  request: initialRequest = null,
}: {
  id: string;
  version: number;
  practice: boolean;
  state: string;
  price: string;
  request?: PaymentRequestView | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<"renew" | "cancel" | null>(null);
  const [request, setRequest] = useState<PaymentRequestView | null>(initialRequest);
  const first = state === "awaiting_payment" || state === "payment_observed";
  const cancelled = state === "cancelled";

  async function post(path: string, withVersion: boolean) {
    setError("");
    setPending(true);
    try {
      const result = await api<{ request?: PaymentRequestView | null }>(
        path,
        withVersion ? { body: { expectedVersion: version }, idempotencyKey: freshKey("subact") } : { method: "POST", body: {} },
      );
      setConfirm(null);
      if (result.request) {
        setRequest(result.request);
      } else {
        toast(path.endsWith("/cancel") ? "Future renewals cancelled." : path.endsWith("/refresh") ? "Period checked." : "Payment recorded.");
        router.refresh();
      }
    } catch (caught) {
      setError(presentError(caught, "We couldn't update the subscription. Reload it before trying again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack">
      {cancelled ? <p className="muted">Cancelled. The record is kept, and it will not renew.</p> : null}
      {!cancelled && !practice && request ? (
        <PaymentPanel
          request={request}
          onConfirmed={() => {
            setRequest(null);
            toast("Payment confirmed on chain. Your period is active.");
            router.refresh();
          }}
        />
      ) : null}
      {cancelled ? null : (
        <div className="row">
          {request && !practice ? null : (
            <button type="button" onClick={() => (practice ? setConfirm("renew") : post(`/api/ash/subscriptions/${id}/renew`, true))} disabled={pending}>
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
        body={`This records a practice payment of ${price} ZEC. It does not approve any period after this one. Each renewal asks for its own confirmation.`}
        confirmLabel={first ? "Pay first period" : "Renew now"}
        pending={pending}
        onClose={() => setConfirm(null)}
        onConfirm={() => post(`/api/ash/subscriptions/${id}/renew`, true)}
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

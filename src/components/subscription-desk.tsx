"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, freshKey } from "@/client/api";
import { ConfirmDialog } from "./confirm-dialog";
import { presentError } from "./labels";

export function PlanForm() {
  const router = useRouter();
  const [title, setTitle] = useState("Research feed");
  const [description, setDescription] = useState("A renewal, not an automatic debit.");
  const [price, setPrice] = useState("0.001");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/ash/plans", { body: { title, description, priceZec: price, intervalDays: 30, graceDays: 3 } });
      router.refresh();
    } catch (caught) {
      setError(presentError(caught, "We couldn't publish the plan. Nobody was charged."));
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
      <p className="field-hint">The period is 30 days, with 3 days of grace. Publishing a plan does not charge anyone.</p>
      <button type="submit">Publish plan</button>
      {error ? <p className="alert">{error}</p> : null}
    </form>
  );
}

export function SubscribeButton({ offerId, title, price, practice }: { offerId: string; title: string; price: string; practice: boolean }) {
  const router = useRouter();
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
        body={
          practice
            ? `The price is ${price} ZEC for the first period. This records a practice payment now. Later periods are not charged unless you renew them yourself.`
            : `The price is ${price} ZEC. In network-check mode a practice payment is refused, and ASH does not debit a wallet on a schedule.`
        }
        confirmLabel={practice ? "Record the first period" : "Continue"}
        pending={pending}
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          setPending(true);
          setError("");
          try {
            await api("/api/ash/subscriptions", { body: { offerId }, idempotencyKey: freshKey("sub") });
            setOpen(false);
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

export function SubscriptionActions({ id, version, practice }: { id: string; version: number; practice: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<"renew" | "cancel" | null>(null);

  async function post(path: string, withVersion: boolean) {
    setError("");
    setPending(true);
    try {
      await api(path, withVersion ? { body: { expectedVersion: version }, idempotencyKey: freshKey("subact") } : { method: "POST", body: {} });
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
      <div className="row">
        <button type="button" onClick={() => setConfirm("renew")} disabled={pending}>
          Renew now
        </button>
        <button className="quiet" type="button" onClick={() => post(`/api/ash/subscriptions/${id}/refresh`, false)} disabled={pending}>
          Check the period
        </button>
        <button className="quiet" type="button" onClick={() => setConfirm("cancel")} disabled={pending}>
          Cancel future renewals
        </button>
      </div>
      {error ? <p className="alert">{error}</p> : null}
      <ConfirmDialog
        open={confirm === "renew"}
        title="Renew for another period?"
        body={
          practice
            ? "This records another practice payment. It does not approve any period after this one. Each renewal asks for its own confirmation."
            : "ASH will try the renewal check. It does not charge a wallet automatically, and a practice payment is refused in network-check mode."
        }
        confirmLabel="Renew now"
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

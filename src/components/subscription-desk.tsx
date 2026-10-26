"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, freshKey } from "@/client/api";

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
      setError(caught instanceof Error ? caught.message : "Could not publish the plan.");
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
        Price ZEC
        <input value={price} onChange={(event) => setPrice(event.target.value)} required />
      </label>
      <button type="submit">Publish plan</button>
      {error ? <p className="alert">{error}</p> : null}
    </form>
  );
}

export function SubscribeButton({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          try {
            await api("/api/ash/subscriptions", { body: { offerId }, idempotencyKey: freshKey("sub") });
            router.refresh();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not subscribe.");
          }
        }}
      >
        Subscribe
      </button>
      {error ? <p className="alert">{error}</p> : null}
    </div>
  );
}

export function SubscriptionActions({ id, version }: { id: string; version: number }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function post(path: string, withVersion: boolean) {
    setError("");
    try {
      await api(path, withVersion ? { body: { expectedVersion: version }, idempotencyKey: freshKey("subact") } : { method: "POST", body: {} });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed.");
    }
  }

  return (
    <div className="row">
      <button type="button" onClick={() => post(`/api/ash/subscriptions/${id}/renew`, true)}>
        Renew now
      </button>
      <button className="quiet" type="button" onClick={() => post(`/api/ash/subscriptions/${id}/refresh`, false)}>
        Refresh clock
      </button>
      <button className="quiet" type="button" onClick={() => post(`/api/ash/subscriptions/${id}/cancel`, true)}>
        Cancel
      </button>
      {error ? <p className="alert">{error}</p> : null}
    </div>
  );
}

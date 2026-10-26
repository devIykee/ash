"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/client/api";
import { encodePaymentSignature, parsePaymentRequired } from "@sdk";

export function AgentForm() {
  const router = useRouter();
  const [name, setName] = useState("Research buyer");
  const [budget, setBudget] = useState("0.01");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const created = await api<{ token: string }>("/api/ash/agents", {
        body: { name, budgetZec: budget, scopes: ["read", "pay", "exchange"] },
      });
      setToken(created.token);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the token.");
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label>
        Budget ZEC
        <input value={budget} onChange={(event) => setBudget(event.target.value)} required />
      </label>
      <button type="submit">Create token</button>
      <p className="muted">The secret is shown once. An agent cannot authorize a payroll run or exceed this budget.</p>
      {token ? (
        <label>
          Token
          <textarea readOnly value={token} />
        </label>
      ) : null}
      {error ? <p className="alert">{error}</p> : null}
    </form>
  );
}

export function RevokeAgent({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      className="quiet"
      type="button"
      onClick={async () => {
        await api(`/api/ash/agents/${id}`, { method: "DELETE" });
        router.refresh();
      }}
    >
      Revoke
    </button>
  );
}

export function PaidApiDemo() {
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  async function run() {
    setError("");
    setOutput("");
    try {
      const first = await fetch("/api/v1/paid/research");
      if (first.status !== 402) throw new Error(`Expected 402, received ${first.status}.`);
      const challenge = parsePaymentRequired(first.headers.get("payment-required"));
      const challengeId = challenge.accepts[0].extra.challengeId;
      const paid = await api<{ paymentRef: string }>(`/api/ash/challenges/${challengeId}/pay`, { method: "POST", body: {} });
      const second = await fetch("/api/v1/paid/research", {
        headers: {
          "payment-signature": encodePaymentSignature({
            challengeId,
            paymentRef: paid.paymentRef,
            network: challenge.accepts[0].network,
          }),
        },
      });
      const body = await second.json();
      if (!second.ok) throw new Error(body.error?.message || "The paid request failed.");
      setOutput(JSON.stringify(body, null, 2));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The demo failed.");
    }
  }

  return (
    <div className="stack">
      <button type="button" onClick={run}>
        Run one paid request
      </button>
      <p className="muted">The first response is a challenge. The note is returned only after this session pays it. A second use of the same reference is rejected.</p>
      {output ? <pre>{output}</pre> : null}
      {error ? <p className="alert">{error}</p> : null}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/client/api";
import { zatoshiToZec } from "@/domain/money";
import { encodePaymentSignature, parsePaymentRequired } from "@sdk";
import { ConfirmDialog } from "./confirm-dialog";
import { presentError } from "./labels";
import { useToast } from "./toast";
import { PaymentPanel, type PaymentRequestView } from "./payment-panel";

export function AgentForm() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("Research buyer");
  const [budget, setBudget] = useState("0.01");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError("");
    setPending(true);
    try {
      const created = await api<{ token: string }>("/api/ash/agents", {
        body: { name, budgetZec: budget, scopes: ["read", "pay", "exchange"] },
      });
      setToken(created.token);
      toast("Token created. Copy it now. It is shown once.");
      setConfirm(false);
      router.refresh();
    } catch (caught) {
      setError(presentError(caught, "We couldn't create the token. No secret was issued."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="stack"
      data-guide="agent-form"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        setConfirm(true);
      }}
    >
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label>
        Spending limit in ZEC
        <input value={budget} onChange={(event) => setBudget(event.target.value)} required inputMode="decimal" />
      </label>
      <button type="submit">Review token</button>
      <p className="muted">The secret is shown once. This token can read, pay, and exchange, up to the limit. It cannot approve a contractor payment run.</p>
      <ConfirmDialog
        open={confirm}
        title="Create this agent token?"
        body={`${name} will have a ${budget} ZEC limit and the read, pay, and exchange scopes. The secret appears once on this page. ASH stores only a hash. Revoking the token later does not undo payments it already made.`}
        confirmLabel="Create token"
        pending={pending}
        onClose={() => setConfirm(false)}
        onConfirm={submit}
      />
      {token ? (
        <label>
          Token, shown once
          <textarea readOnly value={token} />
        </label>
      ) : null}
      {error ? <p className="alert">{error}</p> : null}
    </form>
  );
}

export function RevokeAgent({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <>
      <button className="quiet" type="button" onClick={() => setOpen(true)}>
        Revoke token
      </button>
      {error ? <p className="alert">{error}</p> : null}
      <ConfirmDialog
        open={open}
        title="Revoke this token?"
        body="The token stops working immediately and cannot be restored. Payments it already made stay recorded."
        confirmLabel="Revoke token"
        pending={pending}
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          setPending(true);
          setError("");
          try {
            await api(`/api/ash/agents/${id}`, { method: "DELETE" });
            setOpen(false);
            toast("Token revoked.");
            router.refresh();
          } catch (caught) {
            setError(presentError(caught, "We couldn't revoke the token. It may still be active."));
          } finally {
            setPending(false);
          }
        }}
      />
    </>
  );
}

export function PaidApiDemo({ practice }: { practice: boolean }) {
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [offer, setOffer] = useState<{ challengeId: string; network: string; amount: string; payTo: string } | null>(null);
  const [request, setRequest] = useState<PaymentRequestView | null>(null);

  async function requestNote() {
    setError("");
    setOutput("");
    setRequest(null);
    setPending(true);
    try {
      const first = await fetch("/api/v1/paid/research");
      if (first.status !== 402) {
        const body = (await first.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message || `The service did not ask for payment. It returned ${first.status}.`);
      }
      const challenge = parsePaymentRequired(first.headers.get("payment-required"));
      const accept = challenge.accepts[0];
      const next = { challengeId: accept.extra.challengeId, network: accept.network, amount: accept.amount, payTo: accept.payTo };
      setOffer(next);
      const ref = (accept.extra as { paymentRequestRef?: string | null }).paymentRequestRef;
      if (ref) setRequest(await api<PaymentRequestView>(`/api/ash/payment-requests/${ref}`));
    } catch (caught) {
      setError(presentError(caught, "We couldn't request the note. No payment was recorded."));
    } finally {
      setPending(false);
    }
  }

  async function fetchNote(challengeId: string, network: string, body: Record<string, unknown> = {}) {
    const paid = await api<{ paymentRef: string | null; reason?: string | null }>(`/api/ash/challenges/${challengeId}/pay`, { method: "POST", body });
    if (!paid.paymentRef) throw new Error(paid.reason || "The payment is not confirmed yet.");
    const second = await fetch("/api/v1/paid/research", {
      headers: { "payment-signature": encodePaymentSignature({ challengeId, paymentRef: paid.paymentRef, network }) },
    });
    const result = await second.json();
    if (!second.ok) throw new Error(result.error?.message || "The paid request failed.");
    setOffer(null);
    setRequest(null);
    setOutput(JSON.stringify(result, null, 2));
  }

  async function pay() {
    if (!offer) return;
    setPending(true);
    setError("");
    try {
      await fetchNote(offer.challengeId, offer.network);
    } catch (caught) {
      setError(presentError(caught, "The paid request did not finish. The note was not returned."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack" data-guide="api-demo">
      {request ? null : (
        <button type="button" onClick={requestNote} disabled={pending}>
          Request the note
        </button>
      )}
      <p className="muted">
        {practice
          ? "The first response asks for payment and does not include the note. You confirm the amount before ASH records the payment. The same payment reference works once."
          : "The first response is a payment request. Pay it from your wallet. The note comes back once the payment is confirmed on chain, and the payment works once."}
      </p>
      {request && offer ? (
        <PaymentPanel
          request={request}
          onConfirmed={() => {
            void fetchNote(offer.challengeId, offer.network).catch((caught) => setError(presentError(caught, "The paid request did not finish.")));
          }}
        />
      ) : null}
      {output ? <pre>{output}</pre> : null}
      {error ? <p className="alert">{error}</p> : null}
      <ConfirmDialog
        open={Boolean(offer) && practice}
        title="Pay for this request?"
        body={`The note costs ${offer ? zatoshiToZec(BigInt(offer.amount)) : ""} ZEC. This records a practice payment for this request only. It is not broadcast, and the reference works once.`}
        confirmLabel="Record practice payment"
        pending={pending}
        onClose={() => setOffer(null)}
        onConfirm={pay}
      >
        {offer ? <p className="mono address-line">{offer.payTo}</p> : null}
      </ConfirmDialog>
    </div>
  );
}

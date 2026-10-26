"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/client/api";
import { DISCLOSURES } from "@/domain/types";

const COPY = {
  ufvk: `${DISCLOSURES.viewing} A full viewing key also shows outgoing transfers.`,
  uivk: `${DISCLOSURES.viewing} An incoming viewing key covers every receiver in the account.`,
  filtered_report: "ASH stores the text you type and can stop serving it. ASH did not check it against the chain.",
} as const;

export function GrantForm() {
  const router = useRouter();
  const [capability, setCapability] = useState<keyof typeof COPY>("filtered_report");
  const [scopeNote, setScopeNote] = useState("October contractor total, application filter only.");
  const [reportText, setReportText] = useState("Two lines, 0.03 ZEC, fees separate.");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/ash/grants", {
        body: {
          auditorId: "user_sam",
          capability,
          scopeNote,
          applicationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          reportText: capability === "filtered_report" ? reportText : undefined,
        },
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the grant.");
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label>
        Capability
        <select value={capability} onChange={(event) => setCapability(event.target.value as keyof typeof COPY)}>
          <option value="filtered_report">Filtered report, application enforced</option>
          <option value="uivk">Incoming viewing key disclosure</option>
          <option value="ufvk">Full viewing key disclosure</option>
        </select>
      </label>
      <p className="banner">{COPY[capability]}</p>
      <label>
        Scope note
        <textarea value={scopeNote} onChange={(event) => setScopeNote(event.target.value)} />
      </label>
      {capability === "filtered_report" ? (
        <label>
          Report text
          <textarea value={reportText} onChange={(event) => setReportText(event.target.value)} />
        </label>
      ) : (
        <p className="muted">Do not paste a viewing key. ASH will reject uview and uivk strings, and it never stores one.</p>
      )}
      <button type="submit">Create grant record</button>
      {error ? <p className="alert">{error}</p> : null}
    </form>
  );
}

export function WithdrawGrant({ id, version }: { id: string; version: number }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <div>
      <button
        className="quiet"
        type="button"
        onClick={async () => {
          try {
            await api(`/api/ash/grants/${id}/withdraw`, { body: { expectedVersion: version } });
            router.refresh();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not withdraw.");
          }
        }}
      >
        Withdraw application access
      </button>
      {error ? <p className="alert">{error}</p> : null}
    </div>
  );
}

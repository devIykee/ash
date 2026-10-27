"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/client/api";
import { DISCLOSURES } from "@/domain/types";
import { ConfirmDialog } from "./confirm-dialog";
import { HelpNote } from "./help-note";
import { capabilityLabel, presentError } from "./labels";

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
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError("");
    setPending(true);
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
      setConfirm(false);
      router.refresh();
    } catch (caught) {
      setError(presentError(caught, "We couldn't create this access record. Nothing extra was shared."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="stack"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        setConfirm(true);
      }}
    >
      <label data-guide="grant-capability">
        What Sam can see
        <select value={capability} onChange={(event) => setCapability(event.target.value as keyof typeof COPY)}>
          <option value="filtered_report">A written summary ASH can stop serving</option>
          <option value="uivk">A record that incoming payments would be visible</option>
          <option value="ufvk">A record that the whole account would be visible</option>
        </select>
      </label>
      <HelpNote label="What this choice actually shares">
        A written summary is text you type. The other two choices do not upload a key. They record that a real viewing key cannot be limited to one date or one address, and that ASH cannot take a copied key back.
      </HelpNote>
      <p className="banner">{COPY[capability]}</p>
      <div data-guide="grant-scope">
        <label>
          What this review covers
          <textarea value={scopeNote} onChange={(event) => setScopeNote(event.target.value)} />
        </label>
      </div>
      {capability === "filtered_report" ? (
        <label>
          Summary text
          <textarea value={reportText} onChange={(event) => setReportText(event.target.value)} />
        </label>
      ) : (
        <p className="muted">Do not paste a viewing key. ASH rejects those strings and never stores one.</p>
      )}
      <button type="submit" data-guide="grant-submit">
        Review access
      </button>
      {error ? <p className="alert">{error}</p> : null}
      <ConfirmDialog
        open={confirm}
        title="Share this with Sam?"
        body={
          capability === "filtered_report"
            ? "Sam will be able to read the summary text while this record is active. Withdrawing it stops ASH from serving that text. It does not erase a copy Sam already saved. Access lasts seven days unless you withdraw it sooner."
            : "This records a disclosure. It does not upload a key. Withdrawing the record does not erase a key Sam already holds. Access in ASH lasts seven days unless you withdraw the record sooner."
        }
        confirmLabel="Create the access record"
        pending={pending}
        onClose={() => setConfirm(false)}
        onConfirm={submit}
      >
        <p>
          <strong>{capabilityLabel(capability)}</strong>
        </p>
        <p>{scopeNote}</p>
      </ConfirmDialog>
    </form>
  );
}

export function WithdrawGrant({ id, version, viewing }: { id: string; version: number; viewing: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <div>
      <button className="quiet" type="button" onClick={() => setOpen(true)}>
        Withdraw access in ASH
      </button>
      {error ? <p className="alert">{error}</p> : null}
      <ConfirmDialog
        open={open}
        title="Withdraw this access?"
        body={
          viewing
            ? "ASH will stop treating this record as active. If a viewing key was already copied, withdrawing the record does not delete that key."
            : "ASH will stop serving the written summary. A copy someone already saved is outside ASH."
        }
        confirmLabel="Withdraw access"
        pending={pending}
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          setPending(true);
          try {
            await api(`/api/ash/grants/${id}/withdraw`, { body: { expectedVersion: version } });
            setOpen(false);
            router.refresh();
          } catch (caught) {
            setError(presentError(caught, "We couldn't withdraw this access. The record is unchanged."));
          } finally {
            setPending(false);
          }
        }}
      />
    </div>
  );
}

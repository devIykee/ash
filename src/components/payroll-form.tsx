"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, freshKey } from "@/client/api";
import { presentError } from "./labels";

const FIXTURE_A = "ztestsapling1qv2z2dj8tp5h4zuu4klvlc83qgfjgd2x2a58nz5m4j7uahlsqyfzxdz92enh3zv64w7v6mc0v32";
const FIXTURE_B = "ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez";

type Line = { label: string; address: string; amountZec: string };

export function PayrollForm() {
  const router = useRouter();
  const [name, setName] = useState("October contributors");
  const [lines, setLines] = useState<Line[]>([
    { label: "Ada", address: FIXTURE_A, amountZec: "0.01" },
    { label: "Ben", address: FIXTURE_B, amountZec: "0.02" },
  ]);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function update(index: number, field: keyof Line, value: string) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, [field]: value } : line)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const created = await api<{ operation: { id: string } }>("/api/ash/payroll", {
        body: { name, lines },
        idempotencyKey: freshKey("payroll"),
      });
      router.push(`/payments/payroll/${created.operation.id}`);
      router.refresh();
    } catch (caught) {
      setError(presentError(caught, "We couldn't check this payment run. Nothing was sent."));
    } finally {
      setPending(false);
    }
  }

  if (reviewing) {
    return (
      <form className="stack" onSubmit={submit} data-guide="payroll-submit">
        <h2>Review the payment run</h2>
        <p>Checking this run saves the people and amounts. It does not send money. You still approve it, and then record payments, on the next screen.</p>
        <p>
          <strong>{name}</strong>
        </p>
        <ul>
          {lines.map((line, index) => (
            <li key={`${line.address}-${index}`}>
              {line.label || "Unnamed"} · {line.amountZec || "0"} ZEC
              <div className="mono muted">{line.address}</div>
            </li>
          ))}
        </ul>
        <p className="muted">The sample addresses are test fixtures. Anyone paying them on testnet can lose funds. No fee is known until the payment is recorded.</p>
        <div className="row">
          <button type="submit" disabled={pending}>
            {pending ? "Checking" : "Check this run"}
          </button>
          <button className="quiet" type="button" onClick={() => setReviewing(false)} disabled={pending}>
            Back to editing
          </button>
        </div>
        {error ? <p className="alert">{error}</p> : null}
      </form>
    );
  }

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        setReviewing(true);
      }}
    >
      <p className="banner">The addresses below are structural test fixtures, not live wallets. ASH does not create payment addresses.</p>
      <label data-guide="payroll-name">
        Name of this run
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <div className="stack" data-guide="payroll-lines">
        {lines.map((line, index) => (
          <div className="grid-2" key={index}>
            <label>
              Person
              <input value={line.label} onChange={(event) => update(index, "label", event.target.value)} />
            </label>
            <label>
              Amount in ZEC
              <input value={line.amountZec} onChange={(event) => update(index, "amountZec", event.target.value)} inputMode="decimal" />
            </label>
            <label>
              Shielded payment address
              <input value={line.address} onChange={(event) => update(index, "address", event.target.value)} spellCheck={false} />
            </label>
          </div>
        ))}
      </div>
      <div className="row" data-guide="payroll-submit">
        <button className="quiet" type="button" onClick={() => setLines((current) => [...current, { label: "", address: "", amountZec: "0.01" }])}>
          Add a person
        </button>
        <button type="submit">Review payment run</button>
      </div>
    </form>
  );
}

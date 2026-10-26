"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, freshKey } from "@/client/api";

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
  const [error, setError] = useState("");

  function update(index: number, field: keyof Line, value: string) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, [field]: value } : line)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const created = await api<{ operation: { id: string } }>("/api/ash/payroll", {
        body: { name, lines },
        idempotencyKey: freshKey("payroll"),
      });
      router.push(`/payments/payroll/${created.operation.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the run.");
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <p className="banner">These addresses are structural fixtures, not live diversified wallets. ASH does not derive addresses.</p>
      <label>
        Run name
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      {lines.map((line, index) => (
        <div className="grid-2" key={index}>
          <label>
            Recipient label
            <input value={line.label} onChange={(event) => update(index, "label", event.target.value)} />
          </label>
          <label>
            Amount ZEC
            <input value={line.amountZec} onChange={(event) => update(index, "amountZec", event.target.value)} />
          </label>
          <label>
            Shielded address
            <input value={line.address} onChange={(event) => update(index, "address", event.target.value)} spellCheck={false} />
          </label>
        </div>
      ))}
      <div className="row">
        <button className="quiet" type="button" onClick={() => setLines((current) => [...current, { label: "", address: "", amountZec: "0.01" }])}>
          Add line
        </button>
        <button type="submit">Validate batch</button>
      </div>
      {error ? <p className="alert">{error}</p> : null}
    </form>
  );
}

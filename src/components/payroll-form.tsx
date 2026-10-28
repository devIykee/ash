"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, freshKey } from "@/client/api";
import { presentError } from "./labels";
import { useToast } from "./toast";
import { addressPlaceholder, sampleAddress, TESTNET_FIXTURES, type Runtime } from "./runtime";

type Line = { key: string; label: string; address: string; amountZec: string };

const AMOUNT_RE = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,8})?$/;

let counter = 0;
function lineKey(): string {
  counter += 1;
  return `line-${counter}`;
}

function addressPrefixOk(address: string, runtime: Runtime): boolean {
  const value = address.trim();
  return runtime.network === "mainnet" ? /^(zs1|u1)/.test(value) : /^(ztestsapling1|utest1)/.test(value);
}

export function PayrollForm({ runtime }: { runtime: Runtime }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("October contributors");
  const [lines, setLines] = useState<Line[]>(() => [
    { key: lineKey(), label: "Ada", address: sampleAddress(runtime, 0), amountZec: "0.01" },
    { key: lineKey(), label: "Ben", address: sampleAddress(runtime, 1), amountZec: "0.02" },
  ]);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const usesFixtures = lines.some((line) => (TESTNET_FIXTURES as readonly string[]).includes(line.address.trim()));

  function update(key: string, field: "label" | "address" | "amountZec", value: string) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, [field]: value } : line)));
  }

  function problems(line: Line): string[] {
    const found: string[] = [];
    if (!line.label.trim()) found.push("Add a name.");
    if (!AMOUNT_RE.test(line.amountZec.trim()) || Number(line.amountZec) <= 0) found.push("Use an amount like 0.01, with up to 8 decimals.");
    if (!line.address.trim()) found.push("Add a shielded address.");
    else if (!addressPrefixOk(line.address, runtime)) found.push(`This does not look like a ${runtime.network} shielded address.`);
    return found;
  }

  const total = lines.reduce((sum, line) => sum + (AMOUNT_RE.test(line.amountZec.trim()) ? Math.round(Number(line.amountZec) * 1e8) : 0), 0);
  const totalZec = (total / 1e8).toFixed(8).replace(/\.?0+$/, "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const created = await api<{ operation: { id: string } }>("/api/ash/payroll", {
        body: { name, lines: lines.map(({ label, address, amountZec }) => ({ label: label.trim(), address: address.trim(), amountZec: amountZec.trim() })) },
        idempotencyKey: freshKey("payroll"),
      });
      toast("Payment run checked and saved.");
      router.push(`/payments/payroll/${created.operation.id}`);
      router.refresh();
    } catch (caught) {
      setError(presentError(caught, "We couldn't check this payment run. Nothing was sent."));
      setPending(false);
    }
  }

  if (reviewing) {
    return (
      <form className="stack" onSubmit={submit} data-guide="payroll-submit">
        <h2>Review the payment run</h2>
        <p>Checking this run saves the people and amounts. It does not send money. You still approve it, and then record payments, on the next screen.</p>
        <p>
          <strong>{name}</strong> · {lines.length} {lines.length === 1 ? "person" : "people"} · {totalZec} ZEC before fees
        </p>
        <ul className="stack">
          {lines.map((line) => (
            <li key={line.key}>
              {line.label || "Unnamed"} · {line.amountZec || "0"} ZEC
              <div className="mono muted address-line">{line.address}</div>
            </li>
          ))}
        </ul>
        {usesFixtures ? <p className="muted">The sample addresses are test fixtures. Anyone paying them on testnet can lose funds.</p> : null}
        <p className="muted">No fee is known until the payment is recorded.</p>
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
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || lines.some((line) => problems(line).length > 0)) {
          setShowErrors(true);
          return;
        }
        setReviewing(true);
      }}
    >
      {usesFixtures ? (
        <p className="banner">The sample addresses are structural test fixtures, not live wallets. ASH does not create payment addresses.</p>
      ) : null}
      <label data-guide="payroll-name">
        Name of this run
        <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
        {showErrors && !name.trim() ? <span className="alert">Give the run a name.</span> : null}
      </label>
      <div className="stack" data-guide="payroll-lines">
        {lines.map((line, index) => {
          const found = showErrors ? problems(line) : [];
          return (
            <fieldset className="recipient" key={line.key} aria-label={`Person ${index + 1}`}>
              <div className="recipient-head">
                <span className="kicker">Person {index + 1}</span>
                {lines.length > 1 ? (
                  <button className="quiet small" type="button" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="recipient-fields">
                <label>
                  Name
                  <input value={line.label} onChange={(event) => update(line.key, "label", event.target.value)} maxLength={80} />
                </label>
                <label>
                  Amount in ZEC
                  <input value={line.amountZec} onChange={(event) => update(line.key, "amountZec", event.target.value)} inputMode="decimal" />
                </label>
                <label className="wide">
                  Shielded payment address
                  <input
                    value={line.address}
                    onChange={(event) => update(line.key, "address", event.target.value.trim())}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder={addressPlaceholder(runtime)}
                  />
                </label>
              </div>
              {found.length > 0 ? <p className="alert">{found.join(" ")}</p> : null}
            </fieldset>
          );
        })}
      </div>
      <p className="muted">
        Total {totalZec} ZEC to {lines.length} {lines.length === 1 ? "person" : "people"}, before fees.
      </p>
      <div className="row" data-guide="payroll-submit">
        <button
          className="quiet"
          type="button"
          disabled={lines.length >= 100}
          onClick={() => setLines((current) => [...current, { key: lineKey(), label: "", address: "", amountZec: "0.01" }])}
        >
          Add a person
        </button>
        <button type="submit">Review payment run</button>
      </div>
    </form>
  );
}

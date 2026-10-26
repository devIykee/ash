"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/client/api";
import { zatoshiToZec } from "@/domain/money";

type Line = {
  id: string;
  label: string;
  address: string;
  amountZatoshi: string;
  feeZatoshi: string;
  state: string;
  attempt: number;
  error: string | null;
};

export function PayrollDesk({
  id,
  version,
  canOperate,
  lines,
}: {
  id: string;
  version: number;
  canOperate: boolean;
  lines: Line[] | null;
}) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function post(path: string) {
    setError("");
    try {
      await api(path, { body: { expectedVersion: version } });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed.");
    }
  }

  if (!lines) return <p className="muted">Recipient lines are hidden in the aggregate view.</p>;
  return (
    <div className="stack">
      <table>
        <thead>
          <tr>
            <th>Recipient</th>
            <th>Amount</th>
            <th>Fee</th>
            <th>State</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td>
                {line.label}
                <div className="mono muted">{line.address}</div>
              </td>
              <td className="mono">{zatoshiToZec(BigInt(line.amountZatoshi))}</td>
              <td className="mono">{zatoshiToZec(BigInt(line.feeZatoshi))}</td>
              <td>
                <span className="pill" data-state={line.state}>
                  {line.state}
                </span>
                {line.error ? <div className="muted">{line.error}</div> : null}
              </td>
              <td>
                {canOperate && line.state === "failed" ? (
                  <button type="button" onClick={() => post(`/api/ash/payroll/${id}/lines/${line.id}/retry`)}>
                    Retry
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {canOperate ? (
        <div className="row">
          <button type="button" onClick={() => post(`/api/ash/payroll/${id}/authorize`)}>
            Authorize
          </button>
          <button type="button" onClick={() => post(`/api/ash/payroll/${id}/execute`)}>
            Execute
          </button>
          <button className="quiet" type="button" onClick={() => post(`/api/ash/payroll/${id}/cancel`)}>
            Cancel run
          </button>
        </div>
      ) : null}
      {error ? <p className="alert">{error}</p> : null}
    </div>
  );
}

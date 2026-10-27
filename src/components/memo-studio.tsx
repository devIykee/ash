"use client";

import { useMemo, useState } from "react";
import { api, freshKey } from "@/client/api";
import { MEMO_RULES_VERSION, analyzeMemo, proposeCleanup } from "@/memo/linter";

export function MemoStudio() {
  const [memo, setMemo] = useState("Thanks. Contact ada@example.com about invoice INV-1002.");
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [proposal, setProposal] = useState("");
  const [note, setNote] = useState("");
  const result = useMemo(() => analyzeMemo(memo), [memo]);

  function toggle(id: string) {
    setDismissed((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function preview() {
    setProposal(proposeCleanup(memo, result.findings, dismissed).proposal);
  }

  async function record() {
    setNote("");
    try {
      await api("/api/ash/memo-checks", {
        body: {
          findingCount: result.findings.length,
          dismissedCount: dismissed.length,
          rulesVersion: MEMO_RULES_VERSION,
        },
        idempotencyKey: freshKey("memo"),
      });
      setNote("ASH stored the counts only. The memo stayed in this browser.");
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "We couldn't save the counts. The memo stayed in this browser.");
    }
  }

  return (
    <div className="stack">
      <p className="banner">{result.disclaimer}</p>
      <label data-guide="memo-input">
        Memo
        <textarea value={memo} onChange={(event) => setMemo(event.target.value)} />
        <span className="field-hint">This text stays in the browser unless you later choose to put it on a receipt.</span>
      </label>
      <div data-guide="memo-findings">
      {result.findings.length === 0 ? <p className="muted">No pattern matched. That is not proof the memo is safe.</p> : null}
      {result.findings.map((finding) => (
        <article className="finding" data-severity={finding.severity} key={finding.id}>
          <h3>
            {finding.ruleId} · {finding.severity}
          </h3>
          <p className="mono">{finding.excerpt}</p>
          <p>{finding.reason}</p>
          <label>
            <span>
              <input type="checkbox" checked={dismissed.includes(finding.id)} onChange={() => toggle(finding.id)} /> Dismiss as a false positive
            </span>
          </label>
        </article>
      ))}
      </div>
      <div className="row" data-guide="memo-actions">
        <button type="button" onClick={preview}>
          Preview a cleaner memo
        </button>
        <button className="quiet" type="button" onClick={record}>
          Save the counts only
        </button>
      </div>
      {proposal ? (
        <div className="stack">
          <h2>Suggested memo</h2>
          <pre>{proposal}</pre>
          <button type="button" onClick={() => setMemo(proposal)}>
            Use this memo in the box
          </button>
        </div>
      ) : null}
      {note ? <p className="banner ok">{note}</p> : null}
    </div>
  );
}

"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { initials } from "./format";
import { useToast } from "./toast";

const PEOPLE = [
  { id: "user_avery", name: "Avery Chen", role: "Pays people", does: "Runs payroll for a team and connects agents." },
  { id: "user_noor", name: "Noor Hale", role: "Gets paid", does: "Takes tips, sells files, and runs a subscription." },
  { id: "user_jules", name: "Jules Okonkwo", role: "Buys", does: "Buys files, subscribes, and pays for API calls." },
  { id: "user_sam", name: "Sam Ibarra", role: "Reviews", does: "Sees totals and summaries someone chose to share." },
] as const;

/** First step for a visitor: pick who to be. Then continue to where they were going. */
export function PersonaPicker({ next }: { next: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");

  async function choose(id: string, name: string) {
    setPending(id);
    setError("");
    const response = await fetch("/api/ash/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: id }) });
    if (!response.ok) {
      setPending("");
      setError("That demo person could not be opened. Try again.");
      return;
    }
    toast(`Signed in as ${name}.`);
    if (next) router.push(next);
    router.refresh();
  }

  return (
    <div className="stack">
      <div className="people">
        {PEOPLE.map((person) => (
          <button key={person.id} type="button" className="person" onClick={() => choose(person.id, person.name)} disabled={pending !== ""}>
            <span className="avatar lg" aria-hidden="true">
              {initials(person.name)}
            </span>
            <span className="person-text">
              <strong>{person.name}</strong>
              <span className="person-role">{person.role}</span>
              <span className="muted">{person.does}</span>
            </span>
            <ArrowRight className="person-go" size={18} aria-hidden="true" />
            {pending === person.id ? <span className="sr-only">Opening</span> : null}
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: "0.88rem" }}>
        These are shared demo people with no password. Switch any time from the account menu.
      </p>
      {error ? <p className="alert">{error}</p> : null}
    </div>
  );
}

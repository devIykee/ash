"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const PEOPLE = [
  { id: "user_avery", name: "Avery Chen", role: "Operator" },
  { id: "user_noor", name: "Noor Hale", role: "Creator" },
  { id: "user_jules", name: "Jules Okonkwo", role: "Buyer" },
  { id: "user_sam", name: "Sam Ibarra", role: "Auditor" },
] as const;

export function PersonaSwitch({ current }: { current: { id: string; name: string; role: string } | null }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");

  async function choose(userId: string) {
    setPending(userId);
    setError("");
    const response = await fetch("/api/ash/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setPending("");
    if (!response.ok) {
      setError("Sign-in failed.");
      return;
    }
    router.refresh();
  }

  async function leave() {
    await fetch("/api/ash/session", { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="persona">
      <p>{current ? `${current.name} · ${current.role}` : "Demo sign-in. No password is stored."}</p>
      <div className="persona-grid">
        {PEOPLE.map((person) => (
          <button key={person.id} className={current?.id === person.id ? "" : "quiet"} type="button" onClick={() => choose(person.id)} disabled={pending === person.id}>
            {person.name}
          </button>
        ))}
      </div>
      {current ? (
        <button className="quiet" type="button" onClick={leave}>
          Sign out
        </button>
      ) : null}
      {error ? <p className="alert">{error}</p> : null}
    </div>
  );
}

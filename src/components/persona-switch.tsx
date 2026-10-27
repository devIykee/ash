"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { roleLabel } from "./labels";

const PEOPLE = [
  { id: "user_avery", name: "Avery Chen", role: "operator" },
  { id: "user_noor", name: "Noor Hale", role: "creator" },
  { id: "user_jules", name: "Jules Okonkwo", role: "buyer" },
  { id: "user_sam", name: "Sam Ibarra", role: "auditor" },
] as const;

export function PersonaSwitch({ current }: { current: { id: string; name: string; role: string } | null }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
      setError("We couldn't open that demo account. Nothing was changed.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function leave() {
    await fetch("/api/ash/session", { method: "DELETE" });
    setOpen(false);
    router.refresh();
  }

  const label = current ? `${current.name}` : "Demo account";

  return (
    <div className="persona" ref={rootRef} data-guide="account-menu">
      <button className="persona-button quiet small" type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        {label}
      </button>
      {open ? (
        <div className="persona-panel" id={panelId} role="group" aria-label="Demo accounts">
          <p className="muted">{current ? `${roleLabel(current.role)}. No password is stored.` : "Choose a demo person. No password is stored."}</p>
          <div className="persona-grid">
            {PEOPLE.map((person) => (
              <button key={person.id} className={current?.id === person.id ? "small" : "quiet small"} type="button" onClick={() => choose(person.id)} disabled={pending === person.id}>
                {person.name}
                <span className="sr-only">, {roleLabel(person.role)}</span>
              </button>
            ))}
          </div>
          {current ? (
            <button className="quiet small" type="button" onClick={leave}>
              Sign out
            </button>
          ) : null}
          {error ? <p className="alert">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronsUpDown, LogOut } from "lucide-react";
import { initials } from "./format";
import { roleLabel } from "./labels";
import { useToast } from "./toast";

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
  const toast = useToast();

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
    toast(`Signed in as ${PEOPLE.find((person) => person.id === userId)?.name ?? "demo account"}.`);
    router.refresh();
  }

  async function leave() {
    await fetch("/api/ash/session", { method: "DELETE" });
    setOpen(false);
    toast("Signed out.");
    router.refresh();
  }

  return (
    <div className="persona" ref={rootRef} data-guide="account-menu">
      <button className="persona-button" type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)} aria-label={current ? `Account: ${current.name}` : "Choose a demo account"}>
        <span className="avatar" aria-hidden="true">
          {current ? initials(current.name) : "?"}
        </span>
        <span className="who">
          {current ? current.name : "Demo account"}
          <small>{current ? roleLabel(current.role) : "Not signed in"}</small>
        </span>
        <ChevronsUpDown className="chev" size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className="persona-panel" id={panelId} role="group" aria-label="Demo accounts">
          <p className="muted">Switch demo person. No password is stored.</p>
          <div className="persona-grid">
            {PEOPLE.map((person) => (
              <button
                key={person.id}
                className="persona-option"
                type="button"
                aria-current={current?.id === person.id ? "true" : undefined}
                onClick={() => choose(person.id)}
                disabled={pending === person.id}
              >
                <span className="avatar" aria-hidden="true">
                  {initials(person.name)}
                </span>
                <span className="who">
                  {person.name}
                  <small>{roleLabel(person.role)}</small>
                </span>
                {current?.id === person.id ? <Check className="check" size={16} aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
          {current ? (
            <button className="persona-option persona-signout" type="button" onClick={leave}>
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
          ) : null}
          {error ? <p className="alert">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

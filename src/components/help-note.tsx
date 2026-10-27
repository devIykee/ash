"use client";

import { useId, useState, type ReactNode } from "react";

export function HelpNote({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="help-note">
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        {open ? "Hide explanation" : label}
      </button>
      {open ? (
        <div className="help-note-body" id={panelId}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

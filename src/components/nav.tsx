"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PersonaSwitch } from "./persona-switch";
import { modeLabel, networkLabel, type Runtime } from "./runtime";

const LINKS = [
  ["/workspace", "Workspace"],
  ["/payments", "Payments"],
  ["/commerce", "Exchange"],
  ["/privacy", "Privacy"],
  ["/operations", "Activity"],
  ["/help", "Help"],
] as const;

export function AppHeader({ user, runtime }: { user: { id: string; name: string; role: string } | null; runtime: Runtime }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className={open ? "topbar menu-open" : "topbar"}>
      <div className="topbar-inner">
        <Link className="brand" href="/workspace">
          <strong>ASH</strong>
        </Link>
        <Link
          className="env-badge"
          href="/help#network"
          data-network={runtime.network}
          data-practice={runtime.practice ? "yes" : "no"}
          title={runtime.practice ? "Payments are recorded as practice and never broadcast." : "You pay from your own wallet. ASH looks up the transaction id."}
        >
          <span>{networkLabel(runtime)}</span>
          <span className="env-mode">{modeLabel(runtime)}</span>
        </Link>
        <button className="nav-toggle quiet small" type="button" aria-expanded={open} aria-controls="app-nav app-tools" onClick={() => setOpen((value) => !value)}>
          {open ? "Close" : "Menu"}
        </button>
        <nav id="app-nav" className={open ? "app-nav open" : "app-nav"} aria-label="Workspace">
          {LINKS.map(([href, label]) => {
            const current = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} aria-current={current ? "page" : undefined} data-guide={href === "/help" ? "help-link" : undefined} onClick={() => setOpen(false)}>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="top-tools" id="app-tools">
          <Link href="/docs">Docs</Link>
          <PersonaSwitch current={user} />
        </div>
      </div>
    </header>
  );
}

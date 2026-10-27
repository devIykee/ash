"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PersonaSwitch } from "./persona-switch";

const LINKS = [
  ["/workspace", "Workspace"],
  ["/payments", "Payments"],
  ["/commerce", "Exchange"],
  ["/privacy", "Privacy"],
  ["/operations", "Activity"],
  ["/help", "Help"],
] as const;

export function AppHeader({ user }: { user: { id: string; name: string; role: string } | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" href="/workspace">
          <strong>ASH</strong>
        </Link>
        <button className="nav-toggle quiet small" type="button" aria-expanded={open} aria-controls="app-nav" onClick={() => setOpen((value) => !value)}>
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
        <div className="top-tools">
          <Link href="/docs">Docs</Link>
          <PersonaSwitch current={user} />
        </div>
      </div>
    </header>
  );
}

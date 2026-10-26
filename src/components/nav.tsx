"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PersonaSwitch } from "./persona-switch";

const LINKS = [
  ["/", "Overview"],
  ["/commerce", "Commerce"],
  ["/payments", "Payments"],
  ["/privacy", "Privacy tools"],
  ["/operations", "Operations"],
  ["/agents", "Agents"],
  ["/docs", "Documentation"],
] as const;

export function Nav({ user }: { user: { id: string; name: string; role: string } | null }) {
  const pathname = usePathname();
  return (
    <aside className="nav">
      <Link className="brand" href="/">
        <strong>ASH</strong>
        <span>Private operations</span>
      </Link>
      <nav aria-label="Primary">
        {LINKS.map(([href, label]) => {
          const current = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} aria-current={current ? "page" : undefined}>
              {label}
            </Link>
          );
        })}
      </nav>
      <PersonaSwitch current={user} />
    </aside>
  );
}

"use client";

import {
  Bot,
  BookOpen,
  KeyRound,
  FileLock2,
  History,
  LayoutDashboard,
  LifeBuoy,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PersonaSwitch } from "./persona-switch";
import { ModeSwitch } from "./mode-switch";
import { type Runtime } from "./runtime";
import { ThemeToggle } from "./theme-toggle";

type User = { id: string; name: string; role: string } | null;
type NavItem = { href: string; label: string; icon: LucideIcon; guide?: string };

const MAIN: NavItem[] = [
  { href: "/workspace", label: "Workspace", icon: LayoutDashboard },
  { href: "/payments", label: "Payments", icon: Wallet },
  { href: "/commerce", label: "Exchange", icon: FileLock2 },
  { href: "/privacy", label: "Privacy", icon: ShieldCheck },
  { href: "/operations", label: "Activity", icon: History },
];

const MORE: NavItem[] = [
  { href: "/settings", label: "Receiving keys", icon: KeyRound },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/help", label: "Help", icon: LifeBuoy, guide: "help-link" },
  { href: "/docs", label: "Docs", icon: BookOpen },
];

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/payments" && pathname.startsWith("/payments")) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link className="brand" href="/workspace" aria-label="ASH workspace">
      <span className="brand-mark" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20 12 4l8 16" />
          <path d="M7.5 13h9" />
        </svg>
      </span>
      ASH
    </Link>
  );
}

function SideLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  return (
    <Link className="side-link" href={item.href} aria-current={isCurrent(pathname, item.href) ? "page" : undefined} data-guide={item.guide}>
      <Icon size={18} aria-hidden="true" />
      {item.label}
    </Link>
  );
}

export function Sidebar({ user, runtime }: { user: User; runtime: Runtime }) {
  const pathname = usePathname();
  return (
    <aside className="sidebar" aria-label="Workspace">
      <div className="sidebar-top">
        <Brand />
        <ModeSwitch runtime={runtime} />
      </div>
      <nav className="side-nav" aria-label="Main">
        {MAIN.map((item) => (
          <SideLink key={item.href} item={item} pathname={pathname} />
        ))}
        <p className="side-nav-label">More</p>
        {MORE.map((item) => (
          <SideLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="sidebar-tools">
          <span className="faint" style={{ fontSize: "0.8rem" }}>
            Theme
          </span>
          <ThemeToggle />
        </div>
        <PersonaSwitch current={user} />
      </div>
    </aside>
  );
}

export function MobileBar({ user }: { user: User; runtime?: Runtime }) {
  return (
    <header className="mobile-bar">
      <Brand />
      <span className="spacer" />
      <Link className="icon-button" href="/help" aria-label="Help" data-guide="help-link-mobile">
        <LifeBuoy size={18} aria-hidden="true" />
      </Link>
      <ThemeToggle />
      <PersonaSwitch current={user} />
    </header>
  );
}

export function MobileMode({ runtime }: { runtime: Runtime }) {
  return (
    <div className="mobile-mode">
      <ModeSwitch runtime={runtime} showHint={false} />
    </div>
  );
}

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Main">
      {MAIN.map((item) => {
        const Icon = item.icon;
        return (
          <Link key={item.href} className="tab" href={item.href} aria-current={isCurrent(pathname, item.href) ? "page" : undefined}>
            <Icon size={20} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

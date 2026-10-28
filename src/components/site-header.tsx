"use client";

import Link from "next/link";
import { useState } from "react";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="site-inner">
        <Link className="brand" href="/" aria-label="ASH home">
          <span className="brand-mark" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20 12 4l8 16" />
              <path d="M7.5 13h9" />
            </svg>
          </span>
          ASH
        </Link>
        <button className="nav-toggle quiet" type="button" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen((value) => !value)}>
          {open ? "Close" : "Menu"}
        </button>
        <nav id="site-nav" className={open ? "site-nav open" : "site-nav"} aria-label="Site">
          <a href="#how" onClick={() => setOpen(false)}>
            How it works
          </a>
          <a href="#privacy" onClick={() => setOpen(false)}>
            Privacy
          </a>
          <Link href="/docs" onClick={() => setOpen(false)}>
            Docs
          </Link>
          <ThemeToggle />
          <Link className="button small" href="/workspace">
            {signedIn ? "Go to workspace" : "Open ASH"}
          </Link>
        </nav>
      </div>
    </header>
  );
}

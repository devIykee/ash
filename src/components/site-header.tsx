"use client";

import Link from "next/link";
import { useState } from "react";

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="site-inner">
        <Link className="brand" href="/">
          <strong>ASH</strong>
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
          <Link className="button small" href="/workspace">
            {signedIn ? "Go to workspace" : "Open ASH"}
          </Link>
        </nav>
      </div>
    </header>
  );
}

"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { GuideProvider } from "./guide-provider";
import { AppHeader } from "./nav";

export function Shell({ user, children }: { user: { id: string; name: string; role: string } | null; children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") {
    return (
      <>
        <a className="skip" href="#content">
          Skip to content
        </a>
        {children}
      </>
    );
  }
  return (
    <GuideProvider>
      <div className="app-frame">
        <a className="skip" href="#content">
          Skip to content
        </a>
        <AppHeader user={user} />
        <main className={pathname.startsWith("/docs") ? "main wide" : "main"} id="content">
          {children}
        </main>
      </div>
    </GuideProvider>
  );
}

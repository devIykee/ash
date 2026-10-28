"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { GuideProvider } from "./guide-provider";
import { AppHeader } from "./nav";
import { NavProgress } from "./nav-progress";
import type { Runtime } from "./runtime";

export function Shell({ user, runtime, children }: { user: { id: string; name: string; role: string } | null; runtime: Runtime; children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") {
    return (
      <>
        <NavProgress />
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
        <NavProgress />
        <AppHeader user={user} runtime={runtime} />
        <main className={pathname.startsWith("/docs") ? "main wide" : "main"} id="content">
          {children}
        </main>
      </div>
    </GuideProvider>
  );
}

"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { GuideProvider } from "./guide-provider";
import { ModeBanner } from "./mode-switch";
import { MobileBar, MobileMode, Sidebar, TabBar } from "./nav";
import { NavProgress } from "./nav-progress";
import type { Runtime } from "./runtime";
import { ToastProvider } from "./toast";

export function Shell({ user, runtime, children }: { user: { id: string; name: string; role: string } | null; runtime: Runtime; children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") {
    return (
      <ToastProvider>
        <NavProgress />
        <a className="skip" href="#content">
          Skip to content
        </a>
        {children}
      </ToastProvider>
    );
  }
  return (
    <ToastProvider>
      <GuideProvider>
        <NavProgress />
        <a className="skip" href="#content">
          Skip to content
        </a>
        <div className="app">
          <Sidebar user={user} runtime={runtime} />
          <div className="app-body">
            <MobileBar user={user} runtime={runtime} />
            <ModeBanner runtime={runtime} />
            <MobileMode runtime={runtime} />
            <main className={pathname.startsWith("/docs") ? "main wide" : "main"} id="content">
              {children}
            </main>
          </div>
        </div>
        <TabBar />
      </GuideProvider>
    </ToastProvider>
  );
}

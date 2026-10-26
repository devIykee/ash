import type { ReactNode } from "react";
import { Nav } from "./nav";

export function Shell({ user, children }: { user: { id: string; name: string; role: string } | null; children: ReactNode }) {
  return (
    <div className="app">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <Nav user={user} />
      <main className="main" id="content">
        {children}
      </main>
    </div>
  );
}

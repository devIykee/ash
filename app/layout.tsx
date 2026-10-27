import type { Metadata } from "next";
import "@fontsource/newsreader/latin-400.css";
import "@fontsource/newsreader/latin-500.css";
import "@fontsource/newsreader/latin-600.css";
import "@fontsource/outfit/latin-400.css";
import "@fontsource/outfit/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import { Shell } from "@/components/shell";
import { currentActor } from "@/server/current";
import "./globals.css";

const description = "ASH helps people and AI agents pay, exchange digital resources, and verify what happened without exposing more information than necessary.";

export const metadata: Metadata = {
  title: { default: "ASH", template: "%s · ASH" },
  description,
  applicationName: "ASH",
  openGraph: {
    title: "ASH · Private payments. Clear outcomes.",
    description,
    url: "https://ash-nu-khaki.vercel.app",
    siteName: "ASH",
    type: "website",
  },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  const user = actor ? { id: actor.user.id, name: actor.user.name, role: actor.user.role } : null;
  return (
    <html lang="en">
      <body>
        <Shell user={user}>{children}</Shell>
      </body>
    </html>
  );
}

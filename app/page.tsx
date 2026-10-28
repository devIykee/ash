import type { Metadata } from "next";
import { LandingPage } from "@/components/landing-page";
import { currentActor } from "@/server/current";
import { runtime } from "@/server/runtime";

export const metadata: Metadata = {
  title: "Pay someone privately",
  description: "Pay someone, send a locked file, or show one payment to a reviewer. They only see that.",
};

export default async function HomePage() {
  const actor = await currentActor();
  return <LandingPage signedIn={Boolean(actor)} runtime={runtime()} />;
}

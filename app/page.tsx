import type { Metadata } from "next";
import { LandingPage } from "@/components/landing-page";
import { currentActor } from "@/server/current";

export const metadata: Metadata = {
  title: "Private payments. Clear outcomes.",
  description: "ASH helps people and AI agents pay, exchange digital resources, and verify what happened without exposing more information than necessary.",
};

export default async function HomePage() {
  const actor = await currentActor();
  return <LandingPage signedIn={Boolean(actor)} />;
}

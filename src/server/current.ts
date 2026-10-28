import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PERSONAS } from "@/domain/types";
import type { Actor } from "@/services/common";
import { readSession } from "./auth";

// Cached per request, so the layout and the page share one lookup.
export const currentActor = cache(async function currentActor(): Promise<Actor | null> {
  const jar = await cookies();
  const token = jar.get("ash_session")?.value;
  if (!token) return null;
  const userId = readSession(token);
  if (!userId) return null;
  // Personas are fixed records, so the session resolves without a database round trip.
  const user = PERSONAS.find((persona) => persona.id === userId);
  return user ? { kind: "user", user: { ...user } } : null;
});

export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect("/workspace");
  return actor;
}

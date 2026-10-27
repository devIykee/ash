import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@/domain/types";
import type { Actor } from "@/services/common";
import { readSession } from "./auth";
import { getStore } from "./store";

export async function currentActor(): Promise<Actor | null> {
  const jar = await cookies();
  const token = jar.get("ash_session")?.value;
  if (!token) return null;
  const userId = readSession(token);
  if (!userId) return null;
  return getStore().transaction(async (tx) => {
    const user = await tx.get<User>("user", userId);
    if (!user) return null;
    return { kind: "user", user: user.data };
  });
}

export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect("/workspace");
  return actor;
}

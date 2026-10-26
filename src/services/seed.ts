import { PERSONAS, type User } from "@/domain/types";
import type { Tx } from "@/store/types";

export async function ensureSeed(tx: Tx): Promise<void> {
  for (const persona of PERSONAS) {
    const existing = await tx.get<User>("user", persona.id);
    if (!existing) await tx.put("user", persona.id, persona, null);
  }
}

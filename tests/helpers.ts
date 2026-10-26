import { PERSONAS, type User } from "@/domain/types";
import type { Actor } from "@/services/common";
import { setStore } from "@/server/store";
import { MemoryStore } from "@/store/memory";
import type { Store } from "@/store/types";

export const SAPLING_A = "ztestsapling1qv2z2dj8tp5h4zuu4klvlc83qgfjgd2x2a58nz5m4j7uahlsqyfzxdz92enh3zv64w7v6mc0v32";
export const SAPLING_B = "ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez";

export function useMemory(): Store {
  const store = new MemoryStore();
  setStore(store);
  return store;
}

export function asUser(id: User["id"]): Actor {
  const user = PERSONAS.find((person) => person.id === id);
  if (!user) throw new Error(`missing persona ${id}`);
  return { kind: "user", user };
}

export function key(name: string): string {
  return `test-${name}`.padEnd(8, "x");
}

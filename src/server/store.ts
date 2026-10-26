import path from "node:path";
import { config } from "./config";
import { FileStore } from "@/store/file";
import { UnconfiguredStore } from "@/store/memory";
import { PostgresStore } from "@/store/postgres";
import type { Store } from "@/store/types";

let store: Store | undefined;

export function createStore(): Store {
  const cfg = config();
  if (cfg.databaseUrl) return new PostgresStore(cfg.databaseUrl);
  if (process.env.VERCEL) return new UnconfiguredStore();
  return new FileStore(path.resolve(cfg.dataPath));
}

export function setStore(next: Store): void {
  store = next;
}

export function getStore(): Store {
  if (!store) store = createStore();
  return store;
}

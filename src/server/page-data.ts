import type { Tx } from "@/store/types";
import { inPageMode } from "./mode";
import { getStore } from "./store";

/** Loads page data in the visitor's mode, without a write transaction. */
export function pageRead<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return inPageMode(() => getStore().read(fn));
}

/** Loads page data in the visitor's mode inside a transaction (for pages that may write). */
export function pageTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return inPageMode(() => getStore().transaction(fn));
}

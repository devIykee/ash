import { AshError } from "@/domain/errors";
import type { AshEvent } from "@/domain/types";
import { ensureSeed } from "@/services/seed";
import type { Doc, Store, Tx } from "./types";

type Row = { version: number; data: unknown };

function clone<T>(value: T): T {
  return structuredClone(value);
}

function readOnly(): never {
  throw new AshError("internal", "A read-only view tried to write.", 500);
}

class MemoryTx implements Tx {
  dirty = false;

  constructor(
    private docs: Map<string, Row>,
    private eventLog: AshEvent[],
    private readonlyView = false,
  ) {}

  private key(kind: string, id: string): string {
    return `${kind}\u0000${id}`;
  }

  async get<T>(kind: string, id: string): Promise<Doc<T> | null> {
    const row = this.docs.get(this.key(kind, id));
    if (!row) return null;
    return { id, version: row.version, data: clone(row.data) as T };
  }

  async list<T>(kind: string): Promise<Doc<T>[]> {
    const prefix = `${kind}\u0000`;
    const docs: Doc<T>[] = [];
    for (const [key, row] of this.docs) {
      if (!key.startsWith(prefix)) continue;
      docs.push({ id: key.slice(prefix.length), version: row.version, data: clone(row.data) as T });
    }
    return docs;
  }

  async put<T>(kind: string, id: string, data: T, expectedVersion: number | null): Promise<Doc<T>> {
    if (this.readonlyView) readOnly();
    this.dirty = true;
    const key = this.key(kind, id);
    const current = this.docs.get(key);
    if (expectedVersion === null) {
      if (current) throw new AshError("conflict", "This record already exists.", 409);
      this.docs.set(key, { version: 1, data: clone(data) });
      return { id, version: 1, data: clone(data) };
    }
    if (!current || current.version !== expectedVersion) {
      throw new AshError("conflict", "The record changed. Reload it and try again.", 409);
    }
    const version = current.version + 1;
    this.docs.set(key, { version, data: clone(data) });
    return { id, version, data: clone(data) };
  }

  async appendEvent(event: AshEvent): Promise<void> {
    if (this.readonlyView) readOnly();
    this.dirty = true;
    this.eventLog.push(clone(event));
  }

  async events(operationId: string): Promise<AshEvent[]> {
    return this.eventLog.filter((event) => event.operationId === operationId).map((event) => clone(event));
  }
}

export class MemoryStore implements Store {
  readonly kind: Store["kind"] = "memory";
  protected docs = new Map<string, Row>();
  protected eventLog: AshEvent[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private seeded = false;

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const run = async () => {
      const docs = new Map<string, Row>();
      for (const [key, row] of this.docs) docs.set(key, clone(row));
      const events = clone(this.eventLog);
      const tx = new MemoryTx(docs, events);
      await ensureSeed(tx);
      const result = await fn(tx);
      this.seeded = true;
      if (!tx.dirty) return result;
      this.docs = docs;
      this.eventLog = events;
      await this.persist();
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async read<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    // Committed state is swapped in whole, so reading it directly is consistent.
    if (!this.seeded) return this.transaction(fn);
    return fn(new MemoryTx(this.docs, this.eventLog, true));
  }

  protected async persist(): Promise<void> {}
}

export class UnconfiguredStore implements Store {
  readonly kind = "unconfigured" as const;

  read<T>(): Promise<T> {
    return this.transaction<T>();
  }

  transaction<T>(): Promise<T> {
    return Promise.reject(
      new AshError(
        "configuration_required",
        "This deployment has no DATABASE_URL. Vercel functions cannot keep ASH state on local disk.",
        503,
      ),
    );
  }
}

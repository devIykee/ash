import postgres from "postgres";
import { AshError } from "@/domain/errors";
import type { AshEvent } from "@/domain/types";
import { ensureSeed } from "@/services/seed";
import type { Doc, Store, Tx } from "./types";

const MIGRATION = `
create table if not exists documents (
  kind text not null,
  id text not null,
  version integer not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);
create table if not exists events (
  id text primary key,
  operation_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists events_operation_idx on events (operation_id, created_at);
`;

type Sql = postgres.Sql;

class PgTx implements Tx {
  constructor(
    private sql: Sql,
    private readonlyView = false,
  ) {}

  private guard(): void {
    if (this.readonlyView) throw new AshError("internal", "A read-only view tried to write.", 500);
  }

  async get<T>(kind: string, id: string): Promise<Doc<T> | null> {
    const rows = this.readonlyView
      ? await this.sql<{ version: number; data: T }[]>`select version, data from documents where kind = ${kind} and id = ${id}`
      : await this.sql<{ version: number; data: T }[]>`
          select version, data from documents where kind = ${kind} and id = ${id} for update
        `;
    if (!rows[0]) return null;
    return { id, version: rows[0].version, data: rows[0].data };
  }

  async list<T>(kind: string): Promise<Doc<T>[]> {
    const rows = await this.sql<{ id: string; version: number; data: T }[]>`
      select id, version, data from documents where kind = ${kind}
    `;
    return rows.map((row) => ({ id: row.id, version: row.version, data: row.data }));
  }

  async put<T>(kind: string, id: string, data: T, expectedVersion: number | null): Promise<Doc<T>> {
    this.guard();
    if (expectedVersion === null) {
      const rows = await this.sql<{ version: number }[]>`
        insert into documents (kind, id, version, data)
        values (${kind}, ${id}, 1, ${this.sql.json(data as postgres.JSONValue)})
        on conflict (kind, id) do nothing
        returning version
      `;
      if (!rows[0]) throw new AshError("conflict", "This record already exists.", 409);
      return { id, version: 1, data };
    }
    const rows = await this.sql<{ version: number }[]>`
      update documents
      set data = ${this.sql.json(data as postgres.JSONValue)}, version = version + 1, updated_at = now()
      where kind = ${kind} and id = ${id} and version = ${expectedVersion}
      returning version
    `;
    if (!rows[0]) throw new AshError("conflict", "The record changed. Reload it and try again.", 409);
    return { id, version: rows[0].version, data };
  }

  async appendEvent(event: AshEvent): Promise<void> {
    this.guard();
    await this.sql`
      insert into events (id, operation_id, data)
      values (${event.id}, ${event.operationId}, ${this.sql.json(event as unknown as postgres.JSONValue)})
    `;
  }

  async events(operationId: string): Promise<AshEvent[]> {
    const rows = await this.sql<{ data: AshEvent }[]>`
      select data from events where operation_id = ${operationId} order by created_at asc, id asc
    `;
    return rows.map((row) => row.data);
  }
}

export class PostgresStore implements Store {
  readonly kind = "postgres" as const;
  private sql: Sql;
  private migrated = false;

  constructor(url: string) {
    this.sql = postgres(url, { max: 4, idle_timeout: 20, connect_timeout: 10 });
  }

  private migrating: Promise<void> | null = null;

  // Runs the schema and persona seed once per process, not inside every request.
  migrate(): Promise<void> {
    if (this.migrated) return Promise.resolve();
    if (!this.migrating) {
      this.migrating = (async () => {
        await this.sql.unsafe(MIGRATION);
        await this.sql.begin(async (sql) => {
          await ensureSeed(new PgTx(sql as unknown as Sql));
        });
        this.migrated = true;
      })().finally(() => {
        this.migrating = null;
      });
    }
    return this.migrating;
  }

  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    await this.migrate();
    return this.sql.begin(async (sql) => fn(new PgTx(sql as unknown as Sql))) as Promise<T>;
  }

  async read<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    await this.migrate();
    return fn(new PgTx(this.sql, true));
  }
}

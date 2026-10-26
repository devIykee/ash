import type { AshEvent } from "@/domain/types";

export type Doc<T> = {
  id: string;
  version: number;
  data: T;
};

export interface Tx {
  get<T>(kind: string, id: string): Promise<Doc<T> | null>;
  list<T>(kind: string): Promise<Doc<T>[]>;
  put<T>(kind: string, id: string, data: T, expectedVersion: number | null): Promise<Doc<T>>;
  appendEvent(event: AshEvent): Promise<void>;
  events(operationId: string): Promise<AshEvent[]>;
}

export interface Store {
  readonly kind: "memory" | "file" | "postgres" | "unconfigured";
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AshEvent } from "@/domain/types";
import { MemoryStore } from "./memory";

type Snapshot = {
  docs: [string, { version: number; data: unknown }][];
  events: AshEvent[];
};

export class FileStore extends MemoryStore {
  override readonly kind = "file" as const;

  constructor(private readonly filePath: string) {
    super();
    this.loaded = this.load();
  }

  private loaded: Promise<void>;

  private async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const snapshot = JSON.parse(raw) as Snapshot;
      this.docs = new Map(snapshot.docs);
      this.eventLog = snapshot.events;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  override async transaction<T>(fn: (tx: import("./types").Tx) => Promise<T>): Promise<T> {
    await this.loaded;
    return super.transaction(fn);
  }

  protected override async persist(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const snapshot: Snapshot = { docs: [...this.docs.entries()], events: this.eventLog };
    const temporary = `${this.filePath}.tmp`;
    await writeFile(temporary, JSON.stringify(snapshot));
    await rename(temporary, this.filePath);
  }
}

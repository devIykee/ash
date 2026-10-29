import { canonicalJson } from "@/domain/canonical";
import { newId, nowIso } from "@/domain/ids";
import { assertTransition } from "@/domain/machine";
import { POLICY_VERSION, type AshEvent, type OperationRecord, type OperationState } from "@/domain/types";
import { assertNoSecrets, hashEvent } from "@/evidence/format";
import { currentMode } from "@/server/mode";
import type { Tx } from "@/store/types";

export async function createOperation(
  tx: Tx,
  input: Omit<OperationRecord, "policyVersion" | "createdAt" | "updatedAt" | "disclosures"> & {
    disclosures?: string[];
  },
): Promise<{ id: string; version: number; data: OperationRecord }> {
  const record: OperationRecord = {
    mode: currentMode(),
    ...input,
    policyVersion: POLICY_VERSION,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    disclosures: input.disclosures ?? [],
  };
  const saved = await tx.put("operation", record.id, record, null);
  await appendEvent(tx, record.id, "created", null, record.state, null, "created");
  return saved;
}

export async function saveOperation(
  tx: Tx,
  current: { id: string; version: number; data: OperationRecord },
  next: OperationRecord,
  eventType: string,
  note: string | null = null,
  ref: string | null = null,
): Promise<{ id: string; version: number; data: OperationRecord }> {
  if (current.data.state !== next.state) assertTransition(current.data.type, current.data.state, next.state);
  next.updatedAt = nowIso();
  const saved = await tx.put("operation", current.id, next, current.version);
  if (current.data.state !== next.state || eventType !== "updated") {
    await appendEvent(tx, current.id, eventType, current.data.state, next.state, ref, note);
  }
  return saved;
}

export async function appendEvent(
  tx: Tx,
  operationId: string,
  type: string,
  fromState: OperationState | null,
  toState: OperationState | null,
  ref: string | null,
  note: string | null,
): Promise<AshEvent> {
  const prior = await tx.events(operationId);
  const prevHash = prior.at(-1)?.hash ?? "genesis";
  const body = {
    id: newId("evt"),
    operationId,
    type,
    at: nowIso(),
    fromState,
    toState,
    ref,
    note,
  };
  assertNoSecrets(body);
  const event: AshEvent = { ...body, prevHash, hash: hashEvent(prevHash, body) };
  await tx.appendEvent(event);
  return event;
}

export function canonicalRequest(value: unknown): string {
  return canonicalJson(value);
}

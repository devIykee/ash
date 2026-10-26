import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { AshError } from "@/domain/errors";
import { newId, nowIso } from "@/domain/ids";
import { zecToZatoshi } from "@/domain/money";
import type { Tx } from "@/store/types";
import { assertPerson, assertRole, mustGet, type Actor, type AgentToken } from "./common";

export async function createAgentToken(
  tx: Tx,
  actor: Actor,
  input: { name: string; budgetZec: string; scopes: string[] },
): Promise<{ token: string; agent: Omit<AgentToken, "secretHash" | "charges"> }> {
  assertPerson(actor);
  assertRole(actor, ["operator"]);
  const allowed = new Set(["read", "pay", "exchange", "payroll"]);
  if (input.scopes.length === 0 || input.scopes.some((scope) => !allowed.has(scope))) {
    throw new AshError("validation_failed", "Scopes must be read, pay, exchange, or payroll.");
  }
  const secret = bytesToHex(randomBytes(32));
  const prefix = secret.slice(0, 8);
  const token = `ash_${prefix}_${secret}`;
  const record: AgentToken = {
    id: newId("agent"),
    ownerId: actor.user.id,
    name: input.name.trim(),
    prefix,
    secretHash: bytesToHex(sha256(utf8ToBytes(token))),
    budgetZatoshi: zecToZatoshi(input.budgetZec).toString(),
    spentZatoshi: "0",
    charges: {},
    scopes: input.scopes,
    revokedAt: null,
    createdAt: nowIso(),
  };
  await tx.put("agent_token", record.id, record, null);
  return {
    token,
    agent: {
      id: record.id,
      ownerId: record.ownerId,
      name: record.name,
      prefix: record.prefix,
      budgetZatoshi: record.budgetZatoshi,
      spentZatoshi: record.spentZatoshi,
      scopes: record.scopes,
      revokedAt: null,
      createdAt: record.createdAt,
    },
  };
}

export async function listAgentTokens(tx: Tx, actor: Actor) {
  assertPerson(actor);
  const rows = await tx.list<AgentToken>("agent_token");
  return rows
    .filter((row) => row.data.ownerId === actor.user.id)
    .map((row) => ({
      id: row.id,
      name: row.data.name,
      prefix: row.data.prefix,
      budgetZatoshi: row.data.budgetZatoshi,
      spentZatoshi: row.data.spentZatoshi,
      scopes: row.data.scopes,
      revokedAt: row.data.revokedAt,
    }));
}

export async function revokeAgentToken(tx: Tx, actor: Actor, id: string) {
  assertPerson(actor);
  const doc = await mustGet<AgentToken>(tx, "agent_token", id);
  if (doc.data.ownerId !== actor.user.id) throw new AshError("forbidden", "You cannot revoke this token.", 403);
  await tx.put("agent_token", id, { ...doc.data, revokedAt: nowIso() }, doc.version);
  return { id, revoked: true };
}

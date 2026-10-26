import { timingSafeEqual } from "node:crypto";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { AshError } from "@/domain/errors";
import type { User } from "@/domain/types";
import type { Tx } from "@/store/types";
import { mustGet, type Actor, type AgentToken } from "@/services/common";
import { readCookie, readSession } from "./auth";

function sameHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

async function actorFromToken(tx: Tx, token: string): Promise<Actor> {
  if (!/^ash_[0-9a-f]{8}_[0-9a-f]{64}$/.test(token)) {
    throw new AshError("unauthorized", "Agent token is not valid.", 401);
  }
  const hash = bytesToHex(sha256(utf8ToBytes(token)));
  const rows = await tx.list<AgentToken>("agent_token");
  const found = rows.find((row) => sameHex(row.data.secretHash, hash));
  if (!found) throw new AshError("unauthorized", "Agent token is not valid.", 401);
  if (found.data.revokedAt) throw new AshError("forbidden", "This agent token has been revoked.", 403);
  const user = await mustGet<User>(tx, "user", found.data.ownerId);
  return { kind: "agent", user: user.data, token: found.data };
}

export async function resolveActor(tx: Tx, req: Request): Promise<Actor | null> {
  const header = req.headers.get("authorization");
  if (header) {
    const match = /^Bearer\s+(\S+)$/.exec(header);
    if (!match) throw new AshError("unauthorized", "Authorization must be a Bearer token.", 401);
    return actorFromToken(tx, match[1]);
  }
  const cookie = readCookie(req, "ash_session");
  if (!cookie) return null;
  const userId = readSession(cookie);
  if (!userId) return null;
  const user = await tx.get<User>("user", userId);
  if (!user) return null;
  return { kind: "user", user: user.data };
}

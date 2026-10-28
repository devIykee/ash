import { AshError } from "@/domain/errors";
import { newId } from "@/domain/ids";
import { DISCLOSURES, type OperationRecord, type User } from "@/domain/types";
import type { Tx } from "@/store/types";
import { assertParticipant, assertPerson, mustGet, type Actor } from "./common";
import { createOperation, saveOperation } from "./events";

export type GrantCapability = "ufvk" | "uivk" | "filtered_report";

export type GrantData = {
  ownerId: string;
  auditorId: string;
  capability: GrantCapability;
  scopeNote: string;
  applicationExpiresAt: string;
  reportText: string | null;
  cryptographicRevocation: false;
  disclosure: string;
};

const COPY: Record<GrantCapability, string> = {
  ufvk: `${DISCLOSURES.viewing} A full viewing key also shows outgoing transfers. Withdrawing this grant does not erase it.`,
  uivk: `${DISCLOSURES.viewing} An incoming viewing key still covers every receiver in the account, including Ironwood notes scanned with the Orchard-protocol key. Withdrawing this grant does not erase it.`,
  filtered_report:
    "This is an owner-supplied report stored by ASH. ASH did not check it against the chain. Withdrawing the grant stops ASH from serving it. It does not erase a copy the auditor already saved.",
};

const GRANT_LABEL: Record<GrantCapability, string> = {
  ufvk: "Full viewing key disclosure",
  uivk: "Incoming viewing key disclosure",
  filtered_report: "Written summary for a reviewer",
};

function effective(grant: GrantData, state: OperationRecord["state"], now = Date.now()): OperationRecord["state"] {
  if (state === "cancelled") return state;
  if (Date.parse(grant.applicationExpiresAt) <= now) return "expired";
  return state;
}

function rejectViewingMaterial(value: string): void {
  if (/(uview|uivk)1/i.test(value)) {
    throw new AshError("secret_rejected", "ASH does not store viewing keys. Describe the scope in words.", 400);
  }
}

export async function createGrant(
  tx: Tx,
  actor: Actor,
  input: { auditorId: string; capability: GrantCapability; scopeNote: string; applicationExpiresAt: string; reportText?: string },
) {
  assertPerson(actor);
  rejectViewingMaterial(`${input.scopeNote}\n${input.reportText ?? ""}`);
  if (actor.user.role === "auditor") throw new AshError("forbidden", "Auditors receive grants. They do not create them.", 403);
  const auditor = await tx.get<User>("user", input.auditorId);
  if (!auditor) throw new AshError("validation_failed", "Choose an auditor who has an ASH identity.");
  if (Date.parse(input.applicationExpiresAt) <= Date.now()) {
    throw new AshError("validation_failed", "The application expiry must be in the future.");
  }
  const id = newId("op");
  const data: GrantData = {
    ownerId: actor.user.id,
    auditorId: input.auditorId,
    capability: input.capability,
    scopeNote: input.scopeNote.trim(),
    applicationExpiresAt: input.applicationExpiresAt,
    reportText: input.capability === "filtered_report" ? input.reportText?.trim() || null : null,
    cryptographicRevocation: false,
    disclosure: COPY[input.capability],
  };
  if (input.capability === "filtered_report" && !data.reportText) {
    throw new AshError("validation_failed", "A filtered report needs the text the owner is willing to show.");
  }
  const created = await createOperation(tx, {
    id,
    type: "audit_grant",
    state: "draft",
    initiatorId: actor.user.id,
    participantIds: [actor.user.id, input.auditorId],
    label: GRANT_LABEL[input.capability],
    parentId: null,
    payment: null,
    access: null,
    disclosures: [data.disclosure],
  });
  await tx.put("grant", id, data, null);
  const saved = await saveOperation(tx, created, { ...created.data, state: "authorized" }, "authorized", input.capability);
  return { version: saved.version, operation: saved.data, grant: present(data, saved.data.state, actor) };
}

function present(grant: GrantData, state: OperationRecord["state"], actor: Actor) {
  const shown = effective(grant, state);
  const auditorView = actor.user.id === grant.auditorId;
  return {
    capability: grant.capability,
    scopeNote: grant.scopeNote,
    applicationExpiresAt: grant.applicationExpiresAt,
    applicationState: shown,
    cryptographicRevocation: false,
    stillUsableCryptographically: grant.capability !== "filtered_report",
    disclosure: grant.disclosure,
    reportText: grant.capability === "filtered_report" && auditorView && shown === "authorized" ? grant.reportText : grant.capability === "filtered_report" && actor.user.id === grant.ownerId ? grant.reportText : null,
  };
}

export async function getGrant(tx: Tx, actor: Actor, id: string) {
  const operation = await mustGet<OperationRecord>(tx, "operation", id);
  assertParticipant(actor, operation.data.initiatorId, operation.data.participantIds);
  const grant = await mustGet<GrantData>(tx, "grant", id);
  const shown = effective(grant.data, operation.data.state);
  if (shown === "expired" && operation.data.state === "authorized") {
    const saved = await saveOperation(tx, operation, { ...operation.data, state: "expired" }, "expired", "application clock");
    return { version: saved.version, operation: saved.data, grant: present(grant.data, "expired", actor) };
  }
  return { version: operation.version, operation: operation.data, grant: present(grant.data, operation.data.state, actor) };
}

export async function withdrawGrant(tx: Tx, actor: Actor, id: string, expectedVersion: number) {
  assertPerson(actor);
  const operation = await mustGet<OperationRecord>(tx, "operation", id);
  if (operation.version !== expectedVersion) throw new AshError("conflict", "This grant changed. Reload it.", 409);
  const grant = await mustGet<GrantData>(tx, "grant", id);
  if (actor.user.id !== grant.data.ownerId) throw new AshError("forbidden", "Only the wallet owner can withdraw a grant.", 403);
  const saved = await saveOperation(
    tx,
    operation,
    { ...operation.data, state: "cancelled" },
    "withdrawn",
    grant.data.capability === "filtered_report" ? "application copy withdrawn" : "application record withdrawn; key not revoked",
  );
  return { version: saved.version, operation: saved.data, grant: present(grant.data, "cancelled", actor) };
}

export async function listGrants(tx: Tx, actor: Actor) {
  const grants = await tx.list<GrantData>("grant");
  const mine = grants.filter((grant) => grant.data.ownerId === actor.user.id || grant.data.auditorId === actor.user.id);
  return mine.map((grant) => ({ id: grant.id, capability: grant.data.capability, scopeNote: grant.data.scopeNote }));
}

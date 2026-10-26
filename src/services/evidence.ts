import { newId } from "@/domain/ids";
import { DISCLOSURES, type OperationRecord } from "@/domain/types";
import { decryptEvidence, encryptEvidence, sealEvidence, verifyEvidence, verifyEventChain, type EvidenceBody, type EncryptedEvidence, type SealedEvidence } from "@/evidence/format";
import { config } from "@/server/config";
import { generateX25519 } from "@/crypto/box";
import type { Tx } from "@/store/types";
import { assertParticipant, mustGet, type Actor } from "./common";
import { createOperation, saveOperation } from "./events";

export async function buildEvidence(tx: Tx, actor: Actor, operationId: string, arbiterPublicKey?: string) {
  const operation = await mustGet<OperationRecord>(tx, "operation", operationId);
  assertParticipant(actor, operation.data.initiatorId, operation.data.participantIds);
  const events = await tx.events(operationId);
  const chainOk = verifyEventChain(events);
  const body: EvidenceBody = {
    format: "ash-evidence-v1",
    operationId,
    operationType: operation.data.type,
    generatedAt: new Date().toISOString(),
    disclosure: [DISCLOSURES.evidence, ...operation.data.disclosures],
    facts: [
      { id: "state", source: "ash", value: operation.data.state },
      { id: "policy", source: "ash", value: operation.data.policyVersion },
      { id: "hash_chain", source: "ash", value: chainOk ? "intact" : "broken" },
      ...(operation.data.payment
        ? [
            { id: "payment_status", source: "ash" as const, value: operation.data.payment.status },
            { id: "payment_mode", source: "ash" as const, value: operation.data.payment.mode },
            { id: "payment_txid", source: "ash" as const, value: operation.data.payment.txId || "none" },
          ]
        : []),
    ],
    claims: [{ id: "narrative", suppliedBy: actor.user.id, statement: "The exporter asked ASH to seal the records above.", verified: false }],
    events,
    hashChainOk: chainOk,
    independentlyVerified: false,
    limits: "The signature binds these bytes. It does not prove a Zcash payment, a file's contents, or that an event log was never rewritten by someone who holds the signing key.",
  };
  const pack = sealEvidence(config().receiptSecret, body);
  const evidenceId = newId("op");
  const created = await createOperation(tx, {
    id: evidenceId,
    type: "dispute_evidence",
    state: "draft",
    initiatorId: actor.user.id,
    participantIds: [actor.user.id],
    label: `Evidence ${operation.data.label}`,
    parentId: operationId,
    payment: null,
    access: null,
    disclosures: [DISCLOSURES.evidence],
  });
  await saveOperation(tx, created, { ...created.data, state: "completed" }, "sealed", null, operationId);
  await tx.put("evidence", evidenceId, pack, null);
  if (!arbiterPublicKey) return { id: evidenceId, pack };
  const encrypted: EncryptedEvidence = encryptEvidence(pack, arbiterPublicKey);
  return { id: evidenceId, pack, encrypted };
}

export function verifyUploadedEvidence(pack: SealedEvidence) {
  return verifyEvidence(pack);
}

export function openUploadedEvidence(encrypted: EncryptedEvidence, privateKey: string) {
  return decryptEvidence(encrypted, privateKey);
}

export function newArbiterKey() {
  return generateX25519();
}

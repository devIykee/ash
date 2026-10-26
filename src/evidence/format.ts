import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { canonicalJson } from "@/domain/canonical";
import { AshError } from "@/domain/errors";
import type { AshEvent } from "@/domain/types";
import { openBox, sealTo, type SealedBox } from "@/crypto/box";
import { signDocument, verifyDocument } from "@/crypto/sign";

export type EvidenceFact = { id: string; source: "ash" | "chain" | "client"; value: string };
export type EvidenceClaim = { id: string; suppliedBy: string; statement: string; verified: false };

export type EvidenceBody = {
  format: "ash-evidence-v1";
  operationId: string;
  operationType: string;
  generatedAt: string;
  disclosure: string[];
  facts: EvidenceFact[];
  claims: EvidenceClaim[];
  events: AshEvent[];
  hashChainOk: boolean;
  independentlyVerified: false;
  limits: string;
};

export type SealedEvidence = EvidenceBody & {
  publicKey: string;
  signature: string;
};

export type EncryptedEvidence = {
  format: "ash-evidence-sealed-v1";
  operationId: string;
  box: SealedBox;
};

const FORBIDDEN_KEY = /^(privateKey|spendingKey|seedPhrase|viewingKey|ufvk|uivk|contentKey|shareB|shareS|shareM|memoPlaintext)$/i;

export function assertNoSecrets(value: unknown): void {
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (FORBIDDEN_KEY.test(key)) throw new AshError("secret_rejected", "A record contained a forbidden secret field.");
      if (typeof child === "string" && /^(uview|uivk)1/.test(child)) {
        throw new AshError("secret_rejected", "A record contained viewing-key material.");
      }
      walk(child);
    }
  };
  walk(value);
}

export function hashEvent(prevHash: string, event: Omit<AshEvent, "hash" | "prevHash">): string {
  return bytesToHex(sha256(utf8ToBytes(canonicalJson({ prevHash, ...event }))));
}

export function verifyEventChain(events: AshEvent[]): boolean {
  let prev = "genesis";
  for (const event of events) {
    if (event.prevHash !== prev) return false;
    const { hash, prevHash, ...rest } = event;
    void prevHash;
    if (hashEvent(event.prevHash, rest) !== hash) return false;
    prev = hash;
  }
  return true;
}

export function sealEvidence(material: string, body: EvidenceBody): SealedEvidence {
  assertNoSecrets(body);
  if (body.independentlyVerified !== false) {
    throw new AshError("invalid_evidence", "ASH cannot mark a locally sealed package as independently verified.");
  }
  if (body.claims.some((claim) => claim.verified !== false)) {
    throw new AshError("invalid_evidence", "User-supplied claims stay unverified.");
  }
  const signature = signDocument(material, body);
  return { ...body, publicKey: signature.publicKey, signature: signature.signature };
}

export function verifyEvidence(pack: SealedEvidence): { valid: boolean; reason: string } {
  try {
    assertNoSecrets(pack);
    if (pack.format !== "ash-evidence-v1") return { valid: false, reason: "Unknown evidence format." };
    if (!pack.operationId || !pack.generatedAt || !Array.isArray(pack.facts) || !Array.isArray(pack.claims)) {
      return { valid: false, reason: "Required evidence fields are missing." };
    }
    if (pack.independentlyVerified !== false) return { valid: false, reason: "A package cannot claim independent verification." };
    if (pack.claims.some((claim) => claim.verified !== false)) {
      return { valid: false, reason: "A claim was marked verified." };
    }
    const { publicKey, signature, ...body } = pack;
    if (!verifyDocument(publicKey, signature, body)) return { valid: false, reason: "Signature does not match the package." };
    if (body.hashChainOk && !verifyEventChain(body.events)) {
      return { valid: false, reason: "Event hash chain does not match the embedded events." };
    }
    return {
      valid: true,
      reason: "The signature matches these bytes. That does not prove the facts are true or that a payment occurred.",
    };
  } catch {
    return { valid: false, reason: "Evidence package is malformed." };
  }
}

export function encryptEvidence(pack: SealedEvidence, arbiterPublicKey: string): EncryptedEvidence {
  return {
    format: "ash-evidence-sealed-v1",
    operationId: pack.operationId,
    box: sealTo(arbiterPublicKey, utf8ToBytes(JSON.stringify(pack))),
  };
}

export function decryptEvidence(encrypted: EncryptedEvidence, arbiterPrivateKey: string): SealedEvidence {
  const bytes = openBox(arbiterPrivateKey, encrypted.box);
  return JSON.parse(new TextDecoder().decode(bytes)) as SealedEvidence;
}

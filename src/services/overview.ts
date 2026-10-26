import { DISCLOSURES, type OperationRecord } from "@/domain/types";
import { config } from "@/server/config";
import type { Tx } from "@/store/types";
import type { Actor } from "./common";

const ATTENTION = new Set(["failed", "partially_completed", "disputed", "grace", "awaiting_payment", "delivery_failed", "awaiting_seller"]);

export async function overview(tx: Tx, actor: Actor) {
  const operations = await tx.list<OperationRecord>("operation");
  const visible = operations.filter((item) => {
    if (item.data.initiatorId === actor.user.id || item.data.participantIds.includes(actor.user.id)) return true;
    return actor.user.role === "auditor" && item.data.type === "payroll_run";
  });
  const cards = visible
    .sort((a, b) => b.data.updatedAt.localeCompare(a.data.updatedAt))
    .slice(0, 12)
    .map((item) => ({
      id: item.id,
      type: item.data.type,
      state: item.data.state,
      label: item.data.label,
      updatedAt: item.data.updatedAt,
    }));
  const cfg = config();
  return {
    cards,
    attention: cards.filter((card) => ATTENTION.has(card.state)),
    pendingVerification: visible
      .filter((item) => item.data.payment?.status === "observed" || item.data.payment?.status === "submitted")
      .map((item) => item.id),
    unresolvedDelivery: visible
      .filter((item) => item.data.type === "data_exchange" && ["awaiting_seller", "delivery_failed", "disputed"].includes(item.data.state))
      .map((item) => item.id),
    warnings: [
      cfg.allowSimulated ? DISCLOSURES.simulated : DISCLOSURES.observed,
      DISCLOSURES.metadata,
      DISCLOSURES.orchard,
      cfg.usingDevSecrets ? "Development signing keys are in use. Set SESSION_SECRET and RECEIPT_SIGNING_SECRET before a shared deployment." : "",
      cfg.payTo.includes("ztestsapling1qv2z2") ? "The default pay-to address is an unfunded structural fixture, not a live wallet." : "",
    ].filter(Boolean),
  };
}

export async function listOperations(tx: Tx, actor: Actor) {
  const operations = await tx.list<OperationRecord>("operation");
  return operations
    .filter((item) => item.data.initiatorId === actor.user.id || item.data.participantIds.includes(actor.user.id) || (actor.user.role === "auditor" && item.data.type === "payroll_run"))
    .sort((a, b) => b.data.updatedAt.localeCompare(a.data.updatedAt))
    .map((item) => ({
      id: item.id,
      type: item.data.type,
      state: item.data.state,
      label: item.data.label,
      updatedAt: item.data.updatedAt,
      version: item.version,
    }));
}

export async function operationDetail(tx: Tx, actor: Actor, id: string) {
  const operations = await tx.list<OperationRecord>("operation");
  const item = operations.find((operation) => operation.id === id);
  if (!item) return null;
  const allowed =
    item.data.initiatorId === actor.user.id ||
    item.data.participantIds.includes(actor.user.id) ||
    (actor.user.role === "auditor" && item.data.type === "payroll_run");
  if (!allowed) return "forbidden" as const;
  const events = await tx.events(id);
  return {
    version: item.version,
    operation: {
      ...item.data,
      payment: actor.user.role === "auditor" ? null : item.data.payment,
    },
    events,
  };
}

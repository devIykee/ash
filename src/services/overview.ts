import { DISCLOSURES, type OperationRecord } from "@/domain/types";
import { config } from "@/server/config";
import { currentMode, recordMode } from "@/server/mode";
import type { Tx } from "@/store/types";
import type { Actor } from "./common";

const ATTENTION = new Set(["failed", "partially_completed", "disputed", "grace", "awaiting_payment", "delivery_failed", "awaiting_seller"]);

export async function overview(tx: Tx, actor: Actor) {
  const mode = currentMode();
  const operations = await tx.list<OperationRecord>("operation");
  const visible = operations.filter((item) => {
    if (recordMode(item.data) !== mode) return false;
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
  const counts = {
    total: visible.length,
    attention: visible.filter((item) => ATTENTION.has(item.data.state)).length,
    checking: visible.filter((item) => item.data.payment?.status === "observed" || item.data.payment?.status === "submitted").length,
    completed: visible.filter((item) => item.data.state === "completed").length,
  };
  return {
    counts,
    cards,
    attention: visible
      .filter((item) => ATTENTION.has(item.data.state))
      .sort((a, b) => b.data.updatedAt.localeCompare(a.data.updatedAt))
      .slice(0, 6)
      .map((item) => ({ id: item.id, type: item.data.type, state: item.data.state, label: item.data.label, updatedAt: item.data.updatedAt })),
    pendingVerification: visible
      .filter((item) => item.data.payment?.status === "observed" || item.data.payment?.status === "submitted")
      .map((item) => item.id),
    unresolvedDelivery: visible
      .filter((item) => item.data.type === "data_exchange" && ["awaiting_seller", "delivery_failed", "disputed"].includes(item.data.state))
      .map((item) => item.id),
    // Facts about how this mode works. Shown folded.
    warnings: cfg.allowSimulated
      ? [DISCLOSURES.simulated, DISCLOSURES.metadata, "Switch to Testnet or Mainnet to send and verify real shielded payments."]
      : [
          `Payments are real Zcash ${cfg.network} transactions sent from your own wallet. ASH never holds a spending key.`,
          `ASH reads the chain through ${cfg.lightwalletdUrl} and trusts it to report blocks honestly. Amounts, recipients, and memos are checked cryptographically.`,
          `A payment counts after ${cfg.requiredConfirmations} confirmation${cfg.requiredConfirmations === 1 ? "" : "s"}.`,
          "ASH verifies Sapling payments. Payment requests use the Sapling receiver of each address.",
          DISCLOSURES.metadata,
        ],
    // Configuration an operator must fix. Shown open.
    problems: [
      cfg.usingDevSecrets ? "Development signing keys are in use. Set SESSION_SECRET and RECEIPT_SIGNING_SECRET before a shared deployment." : "",
      !cfg.allowSimulated && !process.env.VIEWING_KEY_SECRET && process.env.NODE_ENV === "production" ? "VIEWING_KEY_SECRET is not set. Viewing keys are sealed with the session secret instead. Set a dedicated secret." : "",
    ].filter(Boolean),
  };
}

export async function listOperations(tx: Tx, actor: Actor) {
  const mode = currentMode();
  const operations = await tx.list<OperationRecord>("operation");
  return operations
    .filter((item) => recordMode(item.data) === mode)
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
  const item = await tx.get<OperationRecord>("operation", id);
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

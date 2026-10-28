import { DEMO_PAY_TO } from "@/zcash/zip321";
import { assertShieldedDestination } from "@/zcash/address";
import type { Network, PaymentMode } from "@/domain/types";

const DEV_SESSION = "dev-only-session-secret-not-for-production";
const DEV_RECEIPT = "dev-only-receipt-secret-not-for-production";

export type AppConfig = {
  network: Network;
  paymentMode: "simulated" | "chain";
  adapterMode: PaymentMode;
  allowSimulated: boolean;
  rpcUrl: string;
  rpcUser: string;
  rpcPassword: string;
  requiredConfirmations: number;
  payTo: string;
  payToIsFixture: boolean;
  sessionSecret: string;
  receiptSecret: string;
  usingDevSecrets: boolean;
  databaseUrl: string;
  dataPath: string;
};

export function config(): AppConfig {
  const network: Network = process.env.ASH_ZCASH_NETWORK?.trim().toLowerCase() === "mainnet" ? "mainnet" : "testnet";
  const paymentMode = process.env.ASH_PAYMENT_MODE?.trim().toLowerCase() === "chain" ? "chain" : "simulated";
  const sessionSecret = process.env.SESSION_SECRET || DEV_SESSION;
  const receiptSecret = process.env.RECEIPT_SIGNING_SECRET || DEV_RECEIPT;
  const confirmations = Number(process.env.ASH_REQUIRED_CONFIRMATIONS || "3");
  return {
    network,
    paymentMode,
    adapterMode: paymentMode === "chain" ? "chain_observation" : "simulated",
    allowSimulated: paymentMode !== "chain",
    rpcUrl: process.env.ZCASH_RPC_URL || "",
    rpcUser: process.env.ZCASH_RPC_USER || "",
    rpcPassword: process.env.ZCASH_RPC_PASSWORD || "",
    requiredConfirmations: Number.isFinite(confirmations) && confirmations > 0 ? Math.floor(confirmations) : 3,
    // The structural fixture only exists on testnet. Mainnet must name a real recipient.
    payTo: process.env.ASH_PAY_TO?.trim() || (network === "testnet" ? DEMO_PAY_TO : ""),
    payToIsFixture: !process.env.ASH_PAY_TO?.trim() && network === "testnet",
    sessionSecret,
    receiptSecret,
    usingDevSecrets: !process.env.SESSION_SECRET || !process.env.RECEIPT_SIGNING_SECRET,
    databaseUrl: process.env.DATABASE_URL || "",
    dataPath: process.env.ASH_DATA_PATH || ".data/ash.json",
  };
}

export type PayToStatus = { ok: true; address: string; fixture: boolean } | { ok: false; reason: string };

// Checks the server's own receiving address against the configured network.
export function payToStatus(cfg: AppConfig = config()): PayToStatus {
  if (!cfg.payTo) {
    return { ok: false, reason: `ASH_PAY_TO is not set. A ${cfg.network} deployment needs a shielded address that receives API payments.` };
  }
  try {
    assertShieldedDestination(cfg.payTo, cfg.network);
    return { ok: true, address: cfg.payTo, fixture: cfg.payToIsFixture };
  } catch (error) {
    return { ok: false, reason: `ASH_PAY_TO is not a usable ${cfg.network} shielded address. ${error instanceof Error ? error.message : ""}`.trim() };
  }
}

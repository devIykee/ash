import { DEMO_PAY_TO } from "@/zcash/zip321";
import type { Mode, Network, PaymentMode } from "@/domain/types";
import { DEFAULT_LIGHTWALLETD } from "@/zcash/lightwalletd";
import { currentMode, networkOf } from "./mode";

const DEV_SESSION = "dev-only-session-secret-not-for-production";
const DEV_RECEIPT = "dev-only-receipt-secret-not-for-production";
const DEV_KEYS = "dev-only-viewing-key-secret-not-for-production";

export type AppConfig = {
  mode: Mode;
  network: Network;
  paymentMode: "simulated" | "chain";
  adapterMode: PaymentMode;
  /** True only in practice mode. Practice payments never satisfy a testnet or mainnet record. */
  allowSimulated: boolean;
  lightwalletdUrl: string;
  requiredConfirmations: number;
  /** Practice-mode pay-to fixture for the paid API. Real modes pay the operator's verified address. */
  payTo: string;
  payToIsFixture: boolean;
  sessionSecret: string;
  receiptSecret: string;
  keySecret: string;
  usingDevSecrets: boolean;
  databaseUrl: string;
  dataPath: string;
};

function confirmations(network: Network): number {
  const specific = Number(process.env[`ASH_CONFIRMATIONS_${network.toUpperCase()}`] || "");
  if (Number.isFinite(specific) && specific > 0) return Math.floor(specific);
  const shared = Number(process.env.ASH_REQUIRED_CONFIRMATIONS || "");
  if (Number.isFinite(shared) && shared > 0) return Math.floor(shared);
  return network === "mainnet" ? 3 : 1;
}

export function config(mode: Mode = currentMode()): AppConfig {
  const network = networkOf(mode);
  const practice = mode === "practice";
  const sessionSecret = process.env.SESSION_SECRET || DEV_SESSION;
  const receiptSecret = process.env.RECEIPT_SIGNING_SECRET || DEV_RECEIPT;
  return {
    mode,
    network,
    paymentMode: practice ? "simulated" : "chain",
    adapterMode: practice ? "simulated" : "chain_verified",
    allowSimulated: practice,
    lightwalletdUrl: process.env[`ASH_LIGHTWALLETD_${network.toUpperCase()}`]?.trim() || DEFAULT_LIGHTWALLETD[network],
    requiredConfirmations: confirmations(network),
    payTo: DEMO_PAY_TO,
    payToIsFixture: practice,
    sessionSecret,
    receiptSecret,
    keySecret: process.env.VIEWING_KEY_SECRET || process.env.SESSION_SECRET || DEV_KEYS,
    usingDevSecrets: !process.env.SESSION_SECRET || !process.env.RECEIPT_SIGNING_SECRET,
    databaseUrl: process.env.DATABASE_URL || "",
    dataPath: process.env.ASH_DATA_PATH || ".data/ash.json",
  };
}

import type { Mode, Network } from "@/domain/types";

// What a client component needs to know about the current mode. Never secrets.
export type Runtime = { mode: Mode; network: Network; practice: boolean; modes: Mode[]; requiredConfirmations: number };

// Unfunded structural testnet fixtures. Never offered on mainnet.
export const TESTNET_FIXTURES = [
  "ztestsapling1qv2z2dj8tp5h4zuu4klvlc83qgfjgd2x2a58nz5m4j7uahlsqyfzxdz92enh3zv64w7v6mc0v32",
  "ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez",
] as const;

/** Sample fixtures only in practice. Real modes never prefill an address someone could pay by mistake. */
export function sampleAddress(runtime: Runtime, index = 0): string {
  return runtime.practice ? TESTNET_FIXTURES[index % TESTNET_FIXTURES.length] : "";
}

export function addressPlaceholder(runtime: Runtime): string {
  return runtime.network === "mainnet" ? "zs1… or u1…" : "ztestsapling1… or utest1…";
}

export const MODE_LABELS: Record<Mode, string> = { practice: "Practice", testnet: "Testnet", mainnet: "Mainnet" };

export const MODE_HINTS: Record<Mode, string> = {
  practice: "Practice payments. Nothing is sent on a network.",
  testnet: "Real Zcash testnet payments from your wallet. Test coins have no value.",
  mainnet: "Real Zcash mainnet payments from your wallet. Real money.",
};

export function networkLabel(runtime: Runtime): string {
  return MODE_LABELS[runtime.mode];
}

export function modeLabel(runtime: Runtime): string {
  return runtime.practice ? "Practice payments" : "Real payments";
}

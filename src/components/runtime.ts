import type { Network } from "@/domain/types";

// What a client component needs to know about the deployment. Never secrets.
export type Runtime = { network: Network; practice: boolean };

// Unfunded structural testnet fixtures. Never offered on mainnet.
export const TESTNET_FIXTURES = [
  "ztestsapling1qv2z2dj8tp5h4zuu4klvlc83qgfjgd2x2a58nz5m4j7uahlsqyfzxdz92enh3zv64w7v6mc0v32",
  "ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez",
] as const;

export function sampleAddress(runtime: Runtime, index = 0): string {
  return runtime.network === "testnet" ? TESTNET_FIXTURES[index % TESTNET_FIXTURES.length] : "";
}

export function addressPlaceholder(runtime: Runtime): string {
  return runtime.network === "mainnet" ? "zs1… or u1…" : "ztestsapling1… or utest1…";
}

export function networkLabel(runtime: Runtime): string {
  return runtime.network === "mainnet" ? "Mainnet" : "Testnet";
}

export function modeLabel(runtime: Runtime): string {
  return runtime.practice ? "Practice payments" : "Wallet payments";
}

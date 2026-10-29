import type { Runtime } from "@/components/runtime";
import type { Mode } from "@/domain/types";
import { config } from "./config";
import { allowedModes, pageMode } from "./mode";

export function runtimeFor(mode: Mode): Runtime {
  const cfg = config(mode);
  return { mode, network: cfg.network, practice: cfg.allowSimulated, modes: allowedModes(), requiredConfirmations: cfg.requiredConfirmations };
}

/** The visitor's runtime, from their mode cookie. */
export async function pageRuntime(): Promise<Runtime> {
  return runtimeFor(await pageMode());
}

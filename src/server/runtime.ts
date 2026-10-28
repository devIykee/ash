import type { Runtime } from "@/components/runtime";
import { config } from "./config";

export function runtime(): Runtime {
  const cfg = config();
  return { network: cfg.network, practice: cfg.allowSimulated };
}

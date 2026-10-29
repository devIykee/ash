import { KeyRound } from "lucide-react";
import Link from "next/link";
import type { Runtime } from "./runtime";

/** In real modes, payments go to the creator's verified address. Shows it, or how to add one. */
export function PayoutNotice({ runtime, payout }: { runtime: Runtime; payout: string | null }) {
  if (runtime.practice) return null;
  if (!payout) {
    return (
      <div className="banner danger">
        You have no {runtime.network} receiving key yet, so ASH cannot verify payments to you. <Link href="/settings">Add your receiving address and viewing key</Link> first.
      </div>
    );
  }
  return (
    <div className="copy-row" style={{ gridTemplateColumns: "auto minmax(0,1fr)" }}>
      <span className="copy-label row" style={{ gap: "0.35rem" }}>
        <KeyRound size={14} aria-hidden="true" /> Paid to
      </span>
      <span className="mono copy-value">{payout}</span>
    </div>
  );
}

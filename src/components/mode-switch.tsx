"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Mode } from "@/domain/types";
import { api } from "@/client/api";
import { MODE_HINTS, MODE_LABELS, type Runtime } from "./runtime";
import { useToast } from "./toast";

/** Switches between practice, testnet, and mainnet. Each mode is its own workspace of records. */
export function ModeSwitch({ runtime, showHint = true }: { runtime: Runtime; showHint?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<Mode | null>(null);

  async function choose(mode: Mode) {
    if (mode === runtime.mode || pending) return;
    setPending(mode);
    try {
      await api("/api/ash/mode", { body: { mode } });
      toast(`Switched to ${MODE_LABELS[mode]}. ${MODE_HINTS[mode]}`);
      router.refresh();
    } catch {
      toast("Could not switch mode. Try again.", "error");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="stack" style={{ gap: "0.4rem" }}>
      <div className="mode-switch" role="group" aria-label="Payment mode">
        {runtime.modes.map((mode) => (
          <button key={mode} type="button" data-mode={mode} aria-pressed={runtime.mode === mode} onClick={() => choose(mode)} disabled={pending !== null} title={MODE_HINTS[mode]}>
            <span className="dot" aria-hidden="true" />
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>
      {showHint ? <p className="mode-hint">{MODE_HINTS[runtime.mode]}</p> : null}
    </div>
  );
}

/** A strip across the top whenever payments are real. */
export function ModeBanner({ runtime }: { runtime: Runtime }) {
  if (runtime.practice) return null;
  return (
    <div className="mode-banner" data-mode={runtime.mode} role="note">
      {runtime.mode === "mainnet" ? "Mainnet: payments are real money, sent from your own wallet." : "Testnet: real network payments with test coins of no value."}{" "}
      <Link href="/settings">Receiving keys</Link>
    </div>
  );
}

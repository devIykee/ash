import { AsyncLocalStorage } from "node:async_hooks";
import { cookies } from "next/headers";
import { MODES, type Mode, type Network } from "@/domain/types";

export const MODE_COOKIE = "ash_mode";

const store = new AsyncLocalStorage<Mode>();

function parseMode(value: string | undefined | null): Mode | null {
  const v = value?.trim().toLowerCase();
  return MODES.includes(v as Mode) ? (v as Mode) : null;
}

/** Modes this deployment offers. ASH_MODES=practice,testnet,mainnet (default: all three). */
export function allowedModes(): Mode[] {
  const raw = process.env.ASH_MODES;
  if (!raw) return [...MODES];
  const list = raw.split(",").map(parseMode).filter((mode): mode is Mode => mode !== null);
  return list.length > 0 ? list : ["practice"];
}

/** The mode a new visitor starts in. Honors the older ASH_ZCASH_NETWORK and ASH_PAYMENT_MODE settings. */
export function defaultMode(): Mode {
  const explicit = parseMode(process.env.ASH_DEFAULT_MODE);
  const allowed = allowedModes();
  if (explicit && allowed.includes(explicit)) return explicit;
  if (process.env.ASH_PAYMENT_MODE?.trim().toLowerCase() === "chain") {
    const legacy: Mode = process.env.ASH_ZCASH_NETWORK?.trim().toLowerCase() === "mainnet" ? "mainnet" : "testnet";
    if (allowed.includes(legacy)) return legacy;
  }
  return allowed.includes("practice") ? "practice" : allowed[0];
}

export function resolveMode(value: string | undefined | null): Mode {
  const mode = parseMode(value);
  return mode && allowedModes().includes(mode) ? mode : defaultMode();
}

/** Runs fn with a request-scoped mode. Services read it through currentMode() and config(). */
export function withMode<T>(mode: Mode, fn: () => T): T {
  return store.run(mode, fn);
}

export function currentMode(): Mode {
  return store.getStore() ?? defaultMode();
}

export function modeFromRequest(req: Request): Mode {
  const header = req.headers.get("x-ash-mode");
  if (header) return resolveMode(header);
  const cookie = req.headers.get("cookie") ?? "";
  const match = new RegExp(`(?:^|;\\s*)${MODE_COOKIE}=([^;]+)`).exec(cookie);
  return resolveMode(match?.[1]);
}

/** For server components: the visitor's mode from their cookie. */
export async function pageMode(): Promise<Mode> {
  const jar = await cookies();
  return resolveMode(jar.get(MODE_COOKIE)?.value);
}

/** Runs a page's data loading in the visitor's mode. */
export async function inPageMode<T>(fn: () => Promise<T>): Promise<T> {
  const mode = await pageMode();
  return withMode(mode, fn);
}

export function networkOf(mode: Mode): Network {
  return mode === "mainnet" ? "mainnet" : "testnet";
}

export function recordMode(record: { mode?: Mode }): Mode {
  return record.mode ?? "practice";
}

export function modeCookie(mode: Mode): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${MODE_COOKIE}=${mode}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

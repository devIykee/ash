import { AshError } from "./errors";

export const ZATOSHI_PER_ZEC = 100_000_000n;
export const MAX_ZATOSHI = 21_000_000n * ZATOSHI_PER_ZEC;
export const ESTIMATED_FEE_ZATOSHI = 10_000n;

const AMOUNT_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;

export function zecToZatoshi(amount: string): bigint {
  const value = amount.trim();
  if (!AMOUNT_RE.test(value)) {
    throw new AshError(
      "invalid_amount",
      "Amount must be a decimal ZEC value with at most 8 fractional digits.",
    );
  }
  const [whole, frac = ""] = value.split(".");
  const zatoshi = BigInt(whole) * ZATOSHI_PER_ZEC + BigInt(frac.padEnd(8, "0"));
  if (zatoshi > MAX_ZATOSHI) {
    throw new AshError("invalid_amount", "Amount exceeds 21,000,000 ZEC.");
  }
  return zatoshi;
}

export function zatoshiToZec(zatoshi: bigint): string {
  if (zatoshi < 0n) throw new AshError("invalid_amount", "Amount cannot be negative.");
  if (zatoshi > MAX_ZATOSHI) throw new AshError("invalid_amount", "Amount exceeds 21,000,000 ZEC.");
  const whole = zatoshi / ZATOSHI_PER_ZEC;
  const frac = (zatoshi % ZATOSHI_PER_ZEC).toString().padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole.toString()}.${frac}` : whole.toString();
}

export function parseZatoshi(value: string): bigint {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new AshError("invalid_amount", "Zatoshi values must be non-negative integers.");
  }
  const amount = BigInt(value);
  if (amount > MAX_ZATOSHI) throw new AshError("invalid_amount", "Amount exceeds 21,000,000 ZEC.");
  return amount;
}

export function addZatoshi(values: bigint[]): bigint {
  return values.reduce((sum, value) => sum + value, 0n);
}

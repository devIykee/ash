import { AshError } from "@/domain/errors";

const buckets = new Map<string, { tokens: number; updated: number }>();

export function rateLimit(key: string, limit = 60, windowMs = 60_000): void {
  if (process.env.VITEST) return;
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: limit, updated: now };
  const refill = ((now - bucket.updated) / windowMs) * limit;
  bucket.tokens = Math.min(limit, bucket.tokens + refill);
  bucket.updated = now;
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    throw new AshError("rate_limited", "Too many requests. Wait a minute and try again.", 429);
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
}

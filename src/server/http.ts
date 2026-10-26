import { ZodError, type ZodType } from "zod";
import { AshError } from "@/domain/errors";

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AshError) return json({ error: { code: error.code, message: error.message } }, error.status);
  if (error instanceof ZodError) {
    return json({ error: { code: "validation_failed", message: error.issues.map((issue) => issue.message).join(" ") } }, 400);
  }
  console.error("ash_unhandled", error instanceof Error ? error.name : "error");
  return json({ error: { code: "internal", message: "Internal error." } }, 500);
}

export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AshError("invalid_json", "Request body must be JSON.");
  }
}

export function parseBody<T>(schema: ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

export function idempotencyKey(req: Request): string | null {
  const key = req.headers.get("idempotency-key");
  if (!key) return null;
  if (!/^[A-Za-z0-9:_-]{8,80}$/.test(key)) throw new AshError("validation_failed", "Idempotency-Key must be 8 to 80 safe characters.");
  return key;
}

export function assertSameOrigin(req: Request): void {
  if (req.headers.get("authorization")?.startsWith("Bearer ")) return;
  if (!req.headers.get("cookie")) return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("host");
  if (!host || new URL(origin).host !== host) throw new AshError("forbidden", "Cross-origin request rejected.", 403);
}

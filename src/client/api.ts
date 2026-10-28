export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code = "error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function fallbackMessage(status: number): string {
  if (status === 429) return "Too many requests. Wait a minute and try again.";
  if (status === 503) return "ASH is not available right now. Try again shortly.";
  if (status >= 500) return "The server had a problem. Nothing new was saved. Try again.";
  return "Request failed.";
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.idempotencyKey) headers["idempotency-key"] = init.idempotencyKey;
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError("Could not reach ASH. Check your connection and try again.", 0, "network");
  }
  type Body = { error?: { message?: string; code?: string } };
  const data = (await response.json().catch(() => null)) as Body | null;
  if (!response.ok) throw new ApiError(data?.error?.message || fallbackMessage(response.status), response.status, data?.error?.code);
  if (data === null) throw new ApiError("The server sent an unreadable response.", response.status, "invalid_response");
  return data as T;
}

export function freshKey(name: string): string {
  return `${name}-${crypto.randomUUID()}`;
}

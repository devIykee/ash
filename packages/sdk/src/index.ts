export type PaymentRequired = {
  x402Version: number;
  error: string;
  resource: { url: string; description: string; mimeType: string };
  accepts: {
    scheme: string;
    network: string;
    amount: string;
    asset: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra: {
      ashExtension: boolean;
      officialX402Scheme: boolean;
      challengeId: string;
      expiresAt: string;
      amountIsZatoshi: boolean;
      confirmationPolicy: string;
    };
  }[];
};

export type PaymentSignature = {
  x402Version: 2;
  scheme: "zcash-shielded";
  network: string;
  payload: { challengeId: string; paymentRef: string };
};

function encodeBase64(value: string): string {
  if (typeof btoa === "function") return btoa(value);
  return Buffer.from(value, "utf8").toString("base64");
}

function decodeBase64(value: string): string {
  if (typeof atob === "function") return atob(value);
  return Buffer.from(value, "base64").toString("utf8");
}

export function parsePaymentRequired(header: string | null): PaymentRequired {
  if (!header) throw new Error("PAYMENT-REQUIRED header is missing.");
  return JSON.parse(decodeBase64(header)) as PaymentRequired;
}

export function encodePaymentSignature(input: { challengeId: string; paymentRef: string; network: string }): string {
  const body: PaymentSignature = {
    x402Version: 2,
    scheme: "zcash-shielded",
    network: input.network,
    payload: { challengeId: input.challengeId, paymentRef: input.paymentRef },
  };
  return encodeBase64(JSON.stringify(body));
}

export class AshClient {
  cookie = "";
  token = "";

  /** mode: "practice", "testnet", or "mainnet". Sent as x-ash-mode on every request. */
  constructor(
    readonly baseUrl: string,
    public mode: string | null = null,
  ) {}

  private headers(extra: Record<string, string> = {}, body?: unknown): Headers {
    const headers = new Headers(extra);
    if (body !== undefined) headers.set("content-type", "application/json");
    if (this.token) headers.set("authorization", `Bearer ${this.token}`);
    if (this.mode) headers.set("x-ash-mode", this.mode);
    if (this.cookie) headers.set("cookie", this.cookie);
    return headers;
  }

  private capture(response: Response): void {
    const setCookie = response.headers.get("set-cookie");
    if (!setCookie) return;
    const pair = setCookie.split(";")[0];
    if (pair) this.cookie = pair;
  }

  async request<T>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; data: T; headers: Headers }> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers(extra, body),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    this.capture(response);
    const data = (await response.json()) as T;
    return { status: response.status, data, headers: response.headers };
  }

  async signIn(userId: string): Promise<void> {
    this.token = "";
    const result = await this.request("POST", "/api/ash/session", { userId });
    if (result.status !== 200) throw new Error("Sign-in failed.");
  }

  useToken(token: string): void {
    this.token = token;
    this.cookie = "";
  }
}

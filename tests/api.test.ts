import { beforeEach, describe, expect, it } from "vitest";
import { GET as paidResearch } from "../app/api/v1/paid/research/route";
import { encodePaymentSignature, parsePaymentRequired } from "@sdk";
import { handleAsh } from "@/server/dispatch";
import { useMemory } from "./helpers";

beforeEach(() => {
  useMemory();
});

function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const url = `http://ash.local${path}`;
  return handleAsh(
    new Request(url, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    path.replace("/api/ash/", "").split("/").filter(Boolean),
  );
}

describe("ASH HTTP API", () => {
  it("requires a persona and rejects memo text on the linter record", async () => {
    const denied = await call("POST", "/api/ash/payroll", {
      name: "X",
      lines: [{ label: "Ada", address: "ztestsapling1qv2z2dj8tp5h4zuu4klvlc83qgfjgd2x2a58nz5m4j7uahlsqyfzxdz92enh3zv64w7v6mc0v32", amountZec: "0.01" }],
    });
    expect(denied.status).toBe(401);
    const session = await call("POST", "/api/ash/session", { userId: "user_noor" });
    expect(session.status).toBe(200);
    const cookie = session.headers.get("set-cookie")?.split(";")[0] ?? "";
    const leaked = await call(
      "POST",
      "/api/ash/memo-checks",
      { findingCount: 1, dismissedCount: 0, rulesVersion: "ash-memo-1", memo: "ada@example.com" },
      { cookie },
    );
    expect(leaked.status).toBe(400);
    const recorded = await call(
      "POST",
      "/api/ash/memo-checks",
      { findingCount: 1, dismissedCount: 0, rulesVersion: "ash-memo-1" },
      { cookie },
    );
    expect(recorded.status).toBe(201);
    const health = await call("GET", "/api/ash/health");
    expect(health.status).toBe(200);
    const body = (await health.json()) as { paymentMode: string; network: string };
    expect(body.network).toBe("testnet");
    expect(body.paymentMode).toBe("simulated");
  });

  it("serves a 402 and then the note exactly once", async () => {
    const first = await paidResearch(new Request("http://ash.local/api/v1/paid/research"));
    expect(first.status).toBe(402);
    const challenge = parsePaymentRequired(first.headers.get("payment-required"));
    const challengeId = challenge.accepts[0].extra.challengeId;
    const session = await call("POST", "/api/ash/session", { userId: "user_jules" });
    const cookie = session.headers.get("set-cookie")?.split(";")[0] ?? "";
    const paid = await call("POST", `/api/ash/challenges/${challengeId}/pay`, {}, { cookie });
    expect(paid.status).toBe(200);
    const { paymentRef } = (await paid.json()) as { paymentRef: string };
    const signature = encodePaymentSignature({ challengeId, paymentRef, network: challenge.accepts[0].network });
    const ok = await paidResearch(new Request("http://ash.local/api/v1/paid/research", { headers: { "payment-signature": signature } }));
    expect(ok.status).toBe(200);
    const again = await paidResearch(new Request("http://ash.local/api/v1/paid/research", { headers: { "payment-signature": signature } }));
    expect(again.status).toBe(409);
  });

  it("rejects a viewing key field on a grant", async () => {
    const session = await call("POST", "/api/ash/session", { userId: "user_avery" });
    const cookie = session.headers.get("set-cookie")?.split(";")[0] ?? "";
    const response = await call(
      "POST",
      "/api/ash/grants",
      {
        auditorId: "user_sam",
        capability: "uivk",
        scopeNote: "October",
        applicationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        viewingKey: "uivk1notstored",
      },
      { cookie },
    );
    expect(response.status).toBe(400);
  });
});

import { errorResponse, json } from "@/server/http";
import { modeFromRequest, withMode } from "@/server/mode";
import { rateLimit } from "@/server/rate-limit";
import { getStore } from "@/server/store";
import { fulfillChallenge, issueChallenge } from "@/services/x402";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function originOf(req: Request): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

// The mode comes from the x-ash-mode header (agents) or the ash_mode cookie (browsers).
export async function GET(req: Request): Promise<Response> {
  return withMode(modeFromRequest(req), async () => {
    try {
      const client = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
      rateLimit(`${client}:paid-research`);
      const header = req.headers.get("payment-signature");
      if (header) {
        const result = await getStore().transaction((tx) => fulfillChallenge(tx, header, "/api/v1/paid/research"));
        if (result) return json(result);
      }
      const challenge = await getStore().transaction((tx) => issueChallenge(tx, originOf(req)));
      return json(challenge.body, challenge.status, challenge.headers);
    } catch (error) {
      return errorResponse(error);
    }
  });
}

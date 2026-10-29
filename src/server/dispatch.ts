import { z } from "zod";
import { AshError } from "@/domain/errors";
import { PERSONAS, type User } from "@/domain/types";
import type { Tx } from "@/store/types";
import { createAgentToken, listAgentTokens, revokeAgentToken } from "@/services/agents";
import type { Actor } from "@/services/common";
import { buildEvidence, verifyUploadedEvidence } from "@/services/evidence";
import {
  ackExchange,
  createOffer,
  exchangePackage,
  failDelivery,
  getExchange,
  getOffer,
  listOffers,
  openExchange,
  payExchange,
  recoverExchange,
  registerKey,
  releaseExchange,
} from "@/services/exchange";
import { createGrant, getGrant, listGrants, withdrawGrant } from "@/services/grants";
import { recordMemoCheck } from "@/services/memo";
import { listOperations, operationDetail, overview } from "@/services/overview";
import {
  authorizePayroll,
  cancelPayroll,
  cancelPayrollLine,
  createPayroll,
  executePayroll,
  getPayroll,
  listPayroll,
  payrollReport,
  retryPayrollLine,
  verifyPayrollTransaction,
} from "@/services/payroll";
import {
  cancelSubscription,
  createSubscriptionOffer,
  listPlans,
  listSubscriptions,
  refreshSubscription,
  renewSubscription,
  subscribe,
} from "@/services/subscriptions";
import { createTip, getReceipt, getTip, listTips, payTip } from "@/services/tips";
import { checkChallengePayment, payChallenge } from "@/services/x402";
import { checkPaymentRequest, getPaymentRequest, publicRequest } from "@/services/payment-requests";
import { listWalletKeys, removeWalletKey, saveWalletKey } from "@/services/wallet-keys";
import { resolveActor } from "./actor";
import { clearSessionCookie, sessionCookie, signSession } from "./auth";
import { config } from "./config";
import { allowedModes, defaultMode, modeCookie, modeFromRequest, resolveMode, withMode } from "./mode";
import { assertSameOrigin, errorResponse, idempotencyKey, json, parseBody, readJson } from "./http";
import { rateLimit } from "./rate-limit";
import { getStore } from "./store";

const personaId = z.enum(["user_avery", "user_noor", "user_jules", "user_sam"]);
const versionBody = z.object({ expectedVersion: z.number().int().positive() }).strict();
const hex64 = z.string().regex(/^[0-9a-f]{64}$/);
const txIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{64}$/, "A Zcash transaction id is 64 hexadecimal characters.")
  .transform((value) => value.toLowerCase());
const sealedBox = z
  .object({
    v: z.literal(1),
    ephPublic: hex64,
    iv: z.string().regex(/^[0-9a-f]{24}$/),
    ciphertext: z.string().regex(/^[0-9a-f]+$/),
  })
  .strict();

type Ctx = { req: Request; tx: Tx; actor: Actor | null; segments: string[] };

function requireActor(actor: Actor | null): Actor {
  if (!actor) throw new AshError("unauthorized", "Sign in, or present an agent token.", 401);
  return actor;
}

function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "local";
}

export function healthBody() {
  const cfg = config();
  const storeKind = getStore().kind;
  return {
    service: "ash",
    status: cfg.usingDevSecrets || storeKind === "unconfigured" ? "degraded" : "ok",
    mode: cfg.mode,
    modes: allowedModes(),
    defaultMode: defaultMode(),
    network: cfg.network,
    paymentMode: cfg.paymentMode,
    adapterMode: cfg.adapterMode,
    allowSimulated: cfg.allowSimulated,
    requiredConfirmations: cfg.requiredConfirmations,
    lightwalletd: { testnet: config("testnet").lightwalletdUrl, mainnet: config("mainnet").lightwalletdUrl },
    usingDevSecrets: cfg.usingDevSecrets,
    viewingKeySecretSet: Boolean(process.env.VIEWING_KEY_SECRET),
    store: storeKind,
    personas: PERSONAS.map((person) => ({ id: person.id, name: person.name, role: person.role })),
  };
}

async function route(ctx: Ctx): Promise<Response> {
  const { req, tx, segments } = ctx;
  const actor = ctx.actor;
  const [root, id, action, extra] = segments;
  const method = req.method;
  const key = idempotencyKey(req);

  if (root === "session" && method === "POST" && !id) {
    const body = parseBody(z.object({ userId: personaId }).strict(), await readJson(req));
    const user = await tx.get<User>("user", body.userId);
    if (!user) throw new AshError("not_found", "Unknown persona.", 404);
    return json({ user: { id: user.data.id, name: user.data.name, role: user.data.role } }, 200, {
      "set-cookie": sessionCookie(signSession(user.data.id)),
    });
  }
  if (root === "session" && method === "DELETE" && !id) {
    return json({ signedOut: true }, 200, { "set-cookie": clearSessionCookie() });
  }
  if (root === "session" && method === "GET" && !id) {
    return json({ user: actor ? { id: actor.user.id, name: actor.user.name, role: actor.user.role, kind: actor.kind } : null });
  }

  if (root === "mode" && method === "GET") {
    return json({ mode: config().mode, modes: allowedModes() });
  }
  if (root === "mode" && method === "POST") {
    const body = parseBody(z.object({ mode: z.enum(["practice", "testnet", "mainnet"]) }).strict(), await readJson(req));
    if (!allowedModes().includes(body.mode)) throw new AshError("forbidden", `This deployment does not offer ${body.mode}.`, 403);
    return json({ mode: body.mode }, 200, { "set-cookie": modeCookie(resolveMode(body.mode)) });
  }

  if (root === "wallet-keys" && method === "GET") return json({ items: await listWalletKeys(tx, requireActor(actor)) });
  if (root === "wallet-keys" && method === "POST") {
    const body = parseBody(
      z.object({ network: z.enum(["testnet", "mainnet"]), address: z.string().trim().min(10).max(1024), viewingKey: z.string().trim().min(20).max(2048) }).strict(),
      await readJson(req),
    );
    return json({ key: await saveWalletKey(tx, requireActor(actor), body) }, 201);
  }
  if (root === "wallet-keys" && method === "DELETE" && (id === "testnet" || id === "mainnet")) {
    return json(await removeWalletKey(tx, requireActor(actor), id));
  }

  if (root === "payment-requests" && method === "GET" && id && !action) {
    return json(publicRequest(await getPaymentRequest(tx, id)));
  }

  if (root === "overview" && method === "GET") {
    return json(await overview(tx, requireActor(actor)));
  }
  if (root === "operations" && method === "GET" && !id) {
    return json({ items: await listOperations(tx, requireActor(actor)) });
  }
  if (root === "operations" && method === "GET" && id && !action) {
    const detail = await operationDetail(tx, requireActor(actor), id);
    if (detail === "forbidden") throw new AshError("forbidden", "You are not a participant in this operation.", 403);
    if (!detail) throw new AshError("not_found", "Operation not found.", 404);
    return json(detail);
  }

  if (root === "payroll" && method === "POST" && !id) {
    const body = parseBody(
      z
        .object({
          name: z.string().trim().min(1).max(80),
          lines: z
            .array(
              z
                .object({
                  label: z.string().max(80),
                  address: z.string().max(512),
                  amountZec: z.string().max(20),
                })
                .strict(),
            )
            .min(1)
            .max(100),
        })
        .strict(),
      await readJson(req),
    );
    return json(await createPayroll(tx, requireActor(actor), body, key), 201);
  }
  if (root === "payroll" && method === "GET" && !id) return json({ items: await listPayroll(tx, requireActor(actor)) });
  if (root === "payroll" && method === "GET" && id && !action) return json(await getPayroll(tx, requireActor(actor), id));
  if (root === "payroll" && method === "GET" && id && action === "report") {
    const view = new URL(req.url).searchParams.get("view") === "aggregate" ? "aggregate" : "operator";
    return json(await payrollReport(tx, requireActor(actor), id, view));
  }
  if (root === "payroll" && method === "POST" && id && action === "authorize") {
    const body = parseBody(versionBody, await readJson(req));
    return json(await authorizePayroll(tx, requireActor(actor), id, body.expectedVersion));
  }
  if (root === "payroll" && method === "POST" && id && action === "execute") {
    const body = parseBody(versionBody, await readJson(req));
    return json(await executePayroll(tx, requireActor(actor), id, body.expectedVersion));
  }
  if (root === "payroll" && method === "POST" && id && action === "cancel" && !extra) {
    const body = parseBody(versionBody, await readJson(req));
    return json(await cancelPayroll(tx, requireActor(actor), id, body.expectedVersion));
  }
  if (root === "payroll" && method === "POST" && id && action === "lines" && extra) {
    const lineAction = segments[4];
    const body = parseBody(versionBody, await readJson(req));
    if (lineAction === "retry") return json(await retryPayrollLine(tx, requireActor(actor), id, extra, body.expectedVersion));
    if (lineAction === "cancel") return json(await cancelPayrollLine(tx, requireActor(actor), id, extra, body.expectedVersion));
  }

  if (root === "tips" && method === "POST" && !id) {
    const body = parseBody(
      z
        .object({
          title: z.string().trim().min(1).max(80),
          address: z.string().max(512),
          suggestedZec: z.array(z.string().max(20)).min(1).max(6),
          statement: z.string().max(280),
        })
        .strict(),
      await readJson(req),
    );
    return json(await createTip(tx, requireActor(actor), body, key), 201);
  }
  if (root === "tips" && method === "GET" && !id) return json({ items: await listTips(tx, requireActor(actor)) });
  if (root === "tips" && method === "GET" && id) return json(await getTip(tx, id));
  if (root === "tips" && method === "POST" && id && action === "pay") {
    const body = parseBody(
      z
        .object({
          amountZec: z.string().max(20),
          memo: z.string().max(512).optional(),
          includeMemo: z.boolean().optional(),
        })
        .strict(),
      await readJson(req),
    );
    if (body.memo && new TextEncoder().encode(body.memo).length > 512) {
      throw new AshError("validation_failed", "A Zcash memo cannot exceed 512 bytes.");
    }
    return json(await payTip(tx, actor, id, body, key));
  }
  if (root === "receipts" && method === "GET" && id) return json(await getReceipt(tx, id));

  if (root === "challenges" && method === "POST" && id && action === "pay") {
    return json(await payChallenge(tx, requireActor(actor), id));
  }

  if (root === "offers" && method === "POST" && !id) {
    const body = parseBody(
      z
        .object({
          title: z.string().trim().min(1).max(80),
          description: z.string().max(600),
          priceZec: z.string().max(20),
          payTo: z.string().max(512).optional(),
          fileName: z.string().max(200).optional(),
          plaintextSha256: hex64,
          pack: z
            .object({
              v: z.literal(1),
              chunkSize: z.number().int().positive(),
              plaintextSha256: hex64,
              chunks: z
                .array(
                  z
                    .object({
                      iv: z.string().regex(/^[0-9a-f]{24}$/),
                      ciphertext: z.string().regex(/^[0-9a-f]+$/),
                    })
                    .strict(),
                )
                .min(1)
                .max(40),
            })
            .strict(),
        })
        .strict(),
      await readJson(req),
    );
    return json(await createOffer(tx, requireActor(actor), body, key), 201);
  }
  if (root === "offers" && method === "GET" && !id) return json({ items: await listOffers(tx) });
  if (root === "offers" && method === "GET" && id) return json(await getOffer(tx, id, actor));
  if (root === "keys" && method === "POST") {
    const body = parseBody(z.object({ publicKey: hex64 }).strict(), await readJson(req));
    return json(await registerKey(tx, requireActor(actor), body.publicKey));
  }
  if (root === "exchanges" && method === "POST" && !id) {
    const body = parseBody(z.object({ offerId: z.string().min(4).max(80) }).strict(), await readJson(req));
    return json(await openExchange(tx, requireActor(actor), body.offerId, key), 201);
  }
  if (root === "exchanges" && method === "GET" && id && !action) return json(await getExchange(tx, requireActor(actor), id));
  if (root === "exchanges" && method === "GET" && id && action === "package") {
    return json(await exchangePackage(tx, requireActor(actor), id));
  }
  if (root === "exchanges" && method === "POST" && id && action === "release") {
    const body = parseBody(
      z
        .object({
          expectedVersion: z.number().int().positive(),
          buyerShareEnvelope: sealedBox,
          releaseEnvelope: sealedBox,
          mediatorShare: z.object({ index: z.literal(3), bytes: z.string().min(10).max(128) }).strict(),
        })
        .strict(),
      await readJson(req),
    );
    return json(await releaseExchange(tx, requireActor(actor), id, body));
  }
  if (root === "exchanges" && method === "POST" && id && action === "pay") {
    const body = parseBody(versionBody, await readJson(req));
    return json(await payExchange(tx, requireActor(actor), id, body, key));
  }
  if (root === "exchanges" && method === "POST" && id && action === "fail") {
    const body = parseBody(versionBody, await readJson(req));
    return json(await failDelivery(tx, requireActor(actor), id, body.expectedVersion));
  }
  if (root === "exchanges" && method === "POST" && id && action === "recover") {
    return json(await recoverExchange(tx, requireActor(actor), id));
  }
  if (root === "exchanges" && method === "POST" && id && action === "ack") {
    const body = parseBody(versionBody, await readJson(req));
    return json(await ackExchange(tx, requireActor(actor), id, body.expectedVersion));
  }

  if (root === "grants" && method === "POST" && !id) {
    const body = parseBody(
      z
        .object({
          auditorId: personaId,
          capability: z.enum(["ufvk", "uivk", "filtered_report"]),
          scopeNote: z.string().trim().min(1).max(400),
          applicationExpiresAt: z.string().datetime(),
          reportText: z.string().max(4000).optional(),
        })
        .strict(),
      await readJson(req),
    );
    return json(await createGrant(tx, requireActor(actor), body), 201);
  }
  if (root === "grants" && method === "GET" && !id) return json({ items: await listGrants(tx, requireActor(actor)) });
  if (root === "grants" && method === "GET" && id) return json(await getGrant(tx, requireActor(actor), id));
  if (root === "grants" && method === "POST" && id && action === "withdraw") {
    const body = parseBody(versionBody, await readJson(req));
    return json(await withdrawGrant(tx, requireActor(actor), id, body.expectedVersion));
  }

  if (root === "plans" && method === "GET") return json({ items: await listPlans(tx) });
  if (root === "plans" && method === "POST") {
    const body = parseBody(
      z
        .object({
          title: z.string().trim().min(1).max(80),
          description: z.string().max(400),
          priceZec: z.string().max(20),
          payTo: z.string().max(512).optional(),
          intervalDays: z.number().int().min(1).max(366),
          graceDays: z.number().int().min(0).max(30),
        })
        .strict(),
      await readJson(req),
    );
    return json(await createSubscriptionOffer(tx, requireActor(actor), body), 201);
  }
  if (root === "subscriptions" && method === "GET") return json({ items: await listSubscriptions(tx, requireActor(actor)) });
  if (root === "subscriptions" && method === "POST" && !id) {
    const body = parseBody(z.object({ offerId: z.string().min(4).max(80) }).strict(), await readJson(req));
    return json(await subscribe(tx, requireActor(actor), body.offerId, key), 201);
  }
  if (root === "subscriptions" && method === "POST" && id && action === "renew") {
    const body = parseBody(versionBody, await readJson(req));
    return json(await renewSubscription(tx, requireActor(actor), id, body.expectedVersion, key));
  }
  if (root === "subscriptions" && method === "POST" && id && action === "refresh") {
    return json(await refreshSubscription(tx, requireActor(actor), id));
  }
  if (root === "subscriptions" && method === "POST" && id && action === "cancel") {
    const body = parseBody(versionBody, await readJson(req));
    return json(await cancelSubscription(tx, requireActor(actor), id, body.expectedVersion));
  }

  if (root === "memo-checks" && method === "POST") {
    const body = parseBody(
      z
        .object({
          findingCount: z.number().int().min(0).max(500),
          dismissedCount: z.number().int().min(0).max(500),
          rulesVersion: z.literal("ash-memo-1"),
        })
        .strict(),
      await readJson(req),
    );
    return json(await recordMemoCheck(tx, requireActor(actor), body), 201);
  }

  if (root === "evidence" && method === "POST" && !id) {
    const body = parseBody(
      z
        .object({
          operationId: z.string().min(4).max(80),
          arbiterPublicKey: hex64.optional(),
        })
        .strict(),
      await readJson(req),
    );
    return json(await buildEvidence(tx, requireActor(actor), body.operationId, body.arbiterPublicKey), 201);
  }
  if (root === "evidence" && method === "POST" && id === "verify") {
    const body = parseBody(z.object({ pack: z.record(z.string(), z.unknown()) }).strict(), await readJson(req));
    return json(verifyUploadedEvidence(body.pack as never));
  }

  if (root === "agents" && method === "POST" && !id) {
    const body = parseBody(
      z
        .object({
          name: z.string().trim().min(1).max(60),
          budgetZec: z.string().max(20),
          scopes: z.array(z.enum(["read", "pay", "exchange", "payroll"])).min(1).max(4),
        })
        .strict(),
      await readJson(req),
    );
    return json(await createAgentToken(tx, requireActor(actor), body), 201);
  }
  if (root === "agents" && method === "GET") return json({ items: await listAgentTokens(tx, requireActor(actor)) });
  if (root === "agents" && method === "DELETE" && id) return json(await revokeAgentToken(tx, requireActor(actor), id));

  throw new AshError("not_found", "Unknown ASH route.", 404);
}

const txBody = z.object({ txId: txIdSchema.optional() }).strict();

/** Routes that talk to the Zcash network. They run outside any database transaction. */
async function networkRoute(req: Request, segments: string[]): Promise<Response | null> {
  const [root, id, action] = segments;
  if (req.method !== "POST" || !id) return null;
  if (root === "payment-requests" && action === "check") {
    const body = parseBody(txBody, await readJson(req));
    return json(await checkPaymentRequest(id, body.txId));
  }
  if (root === "challenges" && action === "pay") {
    const store = getStore();
    const actor = await store.read((tx) => resolveActor(tx, req));
    const challenge = await store.read((tx) => tx.get<{ requestRef?: string | null }>("challenge", id));
    if (!challenge?.data.requestRef) return null;
    requireActor(actor);
    const body = parseBody(txBody, await readJson(req));
    return json(await checkChallengePayment((fn) => store.read(fn), id, body.txId));
  }
  if (root === "payroll" && action === "verify") {
    const store = getStore();
    const actor = requireActor(await store.read((tx) => resolveActor(tx, req)));
    const body = parseBody(z.object({ txId: txIdSchema }).strict(), await readJson(req));
    return json(await verifyPayrollTransaction(actor, id, body.txId));
  }
  return null;
}

export async function handleAsh(req: Request, segments: string[]): Promise<Response> {
  return withMode(modeFromRequest(req), async () => {
    try {
      rateLimit(`${clientKey(req)}:${req.method}:${segments[0] ?? "root"}`);
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      if (segments[0] === "health" && req.method === "GET") return json(healthBody());
      const network = await networkRoute(req, segments);
      if (network) return network;
      return await getStore().transaction(async (tx) => route({ req, tx, actor: await resolveActor(tx, req), segments }));
    } catch (error) {
      return errorResponse(error);
    }
  });
}

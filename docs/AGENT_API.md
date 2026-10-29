# Agent API

Send `x-ash-mode: practice | testnet | mainnet` on each request to choose the mode (browsers use the `ash_mode` cookie). The TypeScript SDK takes it as the second constructor argument: `new AshClient(url, "testnet")`.

In testnet and mainnet, the 402 challenge's `extra` includes `paymentRequestRef`, `memo`, and `paymentUri`. Pay `payTo` with that memo from a wallet, then `POST /api/ash/challenges/{id}/pay` (optionally with `{ "txId": "..." }`). It returns a `paymentRef` once the payment is confirmed.

Base path: `/api/ash`. Paid example: `/api/v1/paid/research`.

The SDK is `packages/sdk/src/index.ts`, imported as `@sdk`. It parses `PAYMENT-REQUIRED`, builds `PAYMENT-SIGNATURE`, and stores either a session cookie or a bearer token.

## Authentication

Demo people sign in with:

```http
POST /api/ash/session
Content-Type: application/json

{"userId":"user_avery"}
```

The response sets `ash_session`. This is a named demo persona, not a password login.

Agents use `Authorization: Bearer ash_{8 hex}_{64 hex}`. Avery creates one with:

```http
POST /api/ash/agents
{"name":"Research buyer","budgetZec":"0.01","scopes":["read","pay","exchange"]}
```

The token is returned once. `DELETE /api/ash/agents/:id` revokes it. Scopes are `read`, `pay`, `exchange`, and `payroll`. Missing scope is 403. A revoked token is 403. An unknown token is 401.

Agents cannot call person-only actions: payroll authorize, offer create, delivery release, grant create, plan create. Payroll execute is allowed when the token has `payroll` and a person has already authorized the run.

Budget is in zatoshi. Each simulated payment key charges once. A second payment past the budget returns `budget_exceeded` (402).

## Idempotency, limits, and errors

Send `Idempotency-Key` on creates and payments. Replays of the same body return the first result. A different body with the same key returns `idempotency_conflict`.

The in-memory limiter allows 60 requests per minute per client key and route group. It is disabled when `VITEST` is set. It does not coordinate across instances.

Errors are `{ "error": { "code", "message" } }` with an HTTP status. Bodies are not written to logs. Common codes: `unauthorized`, `forbidden`, `validation_failed`, `conflict`, `invalid_state`, `payment_unverified`, `challenge_expired`, `duplicate_fulfillment`, `budget_exceeded`, `secret_rejected`.

## HTTP 402

An unpaid `GET /api/v1/paid/research` returns 402 and:

```json
{
  "x402Version": 2,
  "error": "Payment required",
  "resource": {"url": "http://host/api/v1/paid/research", "description": "One shielded request for a short ASH research note.", "mimeType": "application/json"},
  "accepts": [{
    "scheme": "zcash-shielded",
    "network": "zcash:testnet",
    "amount": "100000",
    "asset": "ZEC",
    "payTo": "<shielded address>",
    "maxTimeoutSeconds": 300,
    "extra": {
      "ashExtension": true,
      "officialX402Scheme": false,
      "challengeId": "chal_…",
      "expiresAt": "…",
      "amountIsZatoshi": true
    }
  }]
}
```

The same JSON is base64 in the `PAYMENT-REQUIRED` header. `amount` is zatoshi, not a decimal ZEC string. This is not an official x402 exact scheme. Those exist for other chains. `network` is `zcash:testnet` or `zcash:mainnet`, which is not a registered CAIP-2 id.

Pay, then retry:

```ts
import { AshClient, encodePaymentSignature, parsePaymentRequired } from "@sdk";

const client = new AshClient("http://127.0.0.1:3000");
client.useToken(process.env.ASH_AGENT_TOKEN ?? "");
const challenge = await client.request("GET", "/api/v1/paid/research");
const required = parsePaymentRequired(challenge.headers.get("payment-required"));
const challengeId = required.accepts[0].extra.challengeId;
const paid = await client.request("POST", `/api/ash/challenges/${challengeId}/pay`);
const signature = encodePaymentSignature({
  challengeId,
  paymentRef: paid.data.paymentRef,
  network: required.accepts[0].network,
});
await client.request("GET", "/api/v1/paid/research", undefined, { "payment-signature": signature });
```

The signature payload is base64 JSON: `scheme: "zcash-shielded"` and `payload.challengeId` plus `payload.paymentRef`. A client-supplied claim without that reference is rejected. The reference does not transfer to another path. Confirmation is the simulated ledger in the default mode. A chain observation is not sufficient, because ASH cannot see the shielded amount.

## Exchange

1. `GET /api/ash/offers`
2. `POST /api/ash/keys` with a 32-byte hex X25519 public key
3. `POST /api/ash/exchanges` with `{ "offerId" }`
4. A person seller `POST /api/ash/exchanges/:id/release` with the two sealed shares and mediator share index 3
5. `POST /api/ash/exchanges/:id/pay` with `{ "expectedVersion" }`
6. `GET /api/ash/exchanges/:id/package`
7. Decrypt locally. Do not send the content key back.

`POST /api/ash/exchanges/:id/fail` and `POST /api/ash/exchanges/:id/recover` follow a failed decryption. `POST /api/ash/exchanges/:id/ack` reconciles.

## Other routes

Payroll: `POST /api/ash/payroll`, `POST /api/ash/payroll/:id/authorize|execute|cancel`, `POST /api/ash/payroll/:id/lines/:lineId/retry|cancel`, `GET /api/ash/payroll/:id/report?view=aggregate`.

Tips: `POST /api/ash/tips`, public `GET /api/ash/tips/:id`, `POST /api/ash/tips/:id/pay`, public `GET /api/ash/receipts/:id`.

Subscriptions: `POST /api/ash/plans`, `GET /api/ash/plans`, `POST /api/ash/subscriptions`, `POST /api/ash/subscriptions/:id/renew|refresh|cancel`.

Grants: `POST /api/ash/grants` rejects unknown keys, including `viewingKey`.

Memos: `POST /api/ash/memo-checks` accepts counts and `rulesVersion` only.

Evidence: `POST /api/ash/evidence`, `POST /api/ash/evidence/verify`. Decryption of an arbiter package stays on the client.

Health: `GET /api/ash/health`.

## Demonstration agent

`agents/demo-agent.ts` is deterministic. With the server running:

```bash
pnpm agent:demo
```

It signs in as Noor, encrypts a note, publishes an offer, mints an Avery-owned token, buys as that agent, has Noor release shares, pays once, replays the same idempotency key, decrypts, calls the 402 endpoint, and checks that a replay is HTTP 409. Output is `demo-output/research-note.txt` and `demo-output/receipt.json`. The content key is not written. Set `ASH_BASE_URL` if the server is not on port 3000.

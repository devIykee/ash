# Deployment

ASH builds as a Next.js application and is deployed on Vercel.

Production: https://ash-nu-khaki.vercel.app

The Vercel project is `ash` on the `iykes-projects-dc0db0ed` team. GitHub `devIykee/ash` `main` deploys to production. Postgres is Neon on the free plan, connected as `DATABASE_URL`. Payment mode is `simulated` on testnet. `/api/ash/health` returns `status: "ok"`, `usingDevSecrets: false`, and `store: "postgres"`. A one-line payroll run was created, authorized, and executed on that deployment. The pay-to address is still the unfunded structural fixture, so a real wallet payment to the 402 challenge would not reach a wallet anyone controls.

## Vercel

1. Create a project with the repository root at the `ash` directory.
2. Framework preset: Next.js. Install command: `pnpm install`. Build command: `pnpm build`.
3. Set environment variables for Production and Preview:

| Name | Value |
| --- | --- |
| `ASH_ZCASH_NETWORK` | `testnet` for a demo |
| `ASH_PAYMENT_MODE` | `simulated` unless you have a node and accept that observation does not release data |
| `ASH_REQUIRED_CONFIRMATIONS` | `3` |
| `ASH_PAY_TO` | A shielded address you control. Do not leave the fixture if anyone might pay |
| `SESSION_SECRET` | At least 32 random characters |
| `RECEIPT_SIGNING_SECRET` | A different 32+ random character string |
| `DATABASE_URL` | Postgres connection string |
| `ZCASH_RPC_URL` | Empty unless you run a node |
| `ZCASH_RPC_USER`, `ZCASH_RPC_PASSWORD` | Only if that node requires them |

4. Provision Postgres. Neon, Vercel Postgres, or another Postgres 15+ host works with the `postgres` driver. Use a pooled connection string if the host recommends one for serverless.
5. Apply `db/migrations/001_init.sql`, or start the app once. `PostgresStore` runs the same SQL on first transaction.
6. Deploy. Do not attach a spending key, seed, or viewing key to the project.

If `DATABASE_URL` is missing, Vercel requests fail with `configuration_required` (503). The JSON file store is not used on Vercel because the function disk is not durable.

## What the host can see

Vercel and the database host see request metadata, the document rows, and ciphertext. They do not receive content keys unless a client violates the UI and posts one. Dev secrets must not be used in production. `/api/ash/health` reports `usingDevSecrets` and `store`.

## Testnet and mainnet

`ASH_ZCASH_NETWORK` changes address checks, ZIP-321 context, and the `zcash:` network string in 402 challenges. It does not select a wallet. Simulated mode never broadcasts, on either network. Chain mode only queries the RPC URL you set. Point that URL at a testnet node when the network is testnet.

The header badge and `/help#network` show the active network and mode to every visitor.

### Mainnet checklist

1. `ASH_ZCASH_NETWORK=mainnet`. The testnet pay-to fixture is never used on mainnet. Without `ASH_PAY_TO`, `/api/v1/paid/research` returns 503 `not_configured` and health reports `payToConfigured: false`.
2. `ASH_PAY_TO` is a mainnet shielded address (`zs1…` or `u1…`) that you control. A testnet address is rejected.
3. Forms no longer prefill sample addresses on mainnet. Creators must paste their own receiving address.
4. For wallet payments, set `ASH_PAYMENT_MODE=chain` and a mainnet `ZCASH_RPC_URL`. Each payment screen then shows a ZIP-321 wallet link and asks for the transaction id. Offers and plans require a receiving address. A seen transaction is recorded as `observed`. It never unlocks a file, issues a receipt, extends a subscription, or serves the paid note, because a shielded amount and recipient are not visible to `getrawtransaction`.
5. Run `ASH_BASE_URL=https://your-deployment pnpm smoke`. In chain mode set `SMOKE_TXID` to a transaction id your node knows.

### What each mode does

| Action | Practice (`simulated`) | Wallet (`chain`) |
| --- | --- | --- |
| Payroll | Records every line, retry a failed line | Pay from a wallet (one ZIP-321 link for unpaid lines), record each transaction id per line |
| Tip | Practice payment and a signed receipt | Transaction id is looked up. No receipt for an observation |
| File exchange | Practice payment unlocks the file | Transaction id is looked up. The file stays locked |
| Subscription | Practice payment starts or extends the period | Transaction id is looked up. The period does not move |
| Paid API | Practice payment returns a one-time reference | Transaction id is looked up. No reference is issued |

## External services

| Service | Required | Privacy note |
| --- | --- | --- |
| Postgres | Yes on Vercel | Stores operation metadata and ciphertext |
| Zcash full node RPC | No | Learns which transaction ids ASH asks about |
| Wallet | No, for the simulated demo | Sees anything the user asks it to pay |
| Vercel | Only if you deploy there | Request logs and function environment |

No lightwalletd, no custodial payment processor, and no object store are configured. Ciphertext is in Postgres. For larger files than 256 KiB, a later version would need a blob store. Keys would still stay with the parties.

## After deployment

`pnpm smoke` runs the steps below and about sixty other checks against any running ASH, and adapts to its network and mode:

```bash
ASH_BASE_URL=https://ash-nu-khaki.vercel.app pnpm smoke
```

It creates demo records on that deployment. Manual steps:

1. `GET /api/ash/health` returns `status: "ok"`, `usingDevSecrets: false`, `store: "postgres"`, and `payToConfigured: true`.
2. Sign in as Avery, create a one-line payroll run, authorize it, and execute it. The state becomes `completed` in simulated mode.
3. As Noor, publish a short offer. As Jules, buy it, release it as Noor, pay, and decrypt in the browser.
4. `GET /api/v1/paid/research` returns 402. After pay and retry, it returns the note once.
5. Confirm the database has no column or JSON key named `viewingKey`, and that offer documents have no plaintext file.

Local production check, without deploying:

```bash
pnpm build
pnpm start
```

That still uses the JSON file unless `DATABASE_URL` is set.

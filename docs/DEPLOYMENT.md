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
| `SESSION_SECRET` | At least 32 random characters |
| `RECEIPT_SIGNING_SECRET` | A different 32+ random character string |
| `VIEWING_KEY_SECRET` | A third 32+ random character string. Seals stored viewing keys |
| `DATABASE_URL` | Postgres connection string |
| `ASH_MODES` | Optional. Default `practice,testnet,mainnet` |
| `ASH_LIGHTWALLETD_TESTNET`, `ASH_LIGHTWALLETD_MAINNET` | Optional. Defaults to the public zec.rocks servers |
| `ASH_CONFIRMATIONS_TESTNET`, `ASH_CONFIRMATIONS_MAINNET` | Optional. Defaults 1 and 3 |

4. Provision Postgres. Neon, Vercel Postgres, or another Postgres 15+ host works with the `postgres` driver. Use a pooled connection string if the host recommends one for serverless.
5. Apply `db/migrations/001_init.sql`, or start the app once. `PostgresStore` runs the same SQL on first transaction.
6. Deploy. Do not attach a spending key or seed to the project. Viewing keys are added by people in the app, never as environment variables.

If `DATABASE_URL` is missing, Vercel requests fail with `configuration_required` (503). The JSON file store is not used on Vercel because the function disk is not durable.

## What the host can see

Vercel and the database host see request metadata, the document rows, and ciphertext. They do not receive content keys unless a client violates the UI and posts one. Dev secrets must not be used in production. `/api/ash/health` reports `usingDevSecrets` and `store`.

## Practice, testnet, and mainnet

Visitors switch modes in the app. The mode is stored in the `ash_mode` cookie, and agents send `x-ash-mode`. `ASH_MODES` limits which modes a deployment offers.

Real modes need no node. ASH reads the chain through lightwalletd (gRPC over HTTP/2) from the function, and the payer's wallet broadcasts. For each person who takes payments, add a receiving address and viewing key under **Receiving keys**. Payroll needs the operator's full viewing key. The paid API is paid to the operator persona's receiving address.

### Mainnet checklist

1. Set `VIEWING_KEY_SECRET`, `SESSION_SECRET`, and `RECEIPT_SIGNING_SECRET` to distinct random values.
2. Demo personas have no password. Anyone can change a persona's receiving key on a public deployment. Do not take real mainnet payments there without real accounts, or limit `ASH_MODES` to `practice,testnet`.
3. Each payee adds a mainnet address that includes a Sapling receiver, with its viewing key. Use a dedicated wallet account: the key reveals every payment into it.
4. Consider your own lightwalletd (`ASH_LIGHTWALLETD_MAINNET`). ASH trusts it for block heights.
5. Run `ASH_BASE_URL=https://your-deployment SMOKE_MODE=mainnet pnpm smoke`. It registers throwaway keys, creates real payment requests, and checks them against the live chain without paying.

### What each mode does

| Action | Practice | Testnet and mainnet |
| --- | --- | --- |
| Payroll | Records every line, retry a failed line | Pay from your wallet (one ZIP-321 link pays every unpaid line), paste the transaction id, lines confirm from your outgoing notes |
| Tip | Practice payment and a signed receipt | Payment request with memo; receipt signed on confirmation |
| File exchange | Practice payment unlocks the file | File unlocks once the payment to the seller confirms |
| Subscription | Practice payment starts or extends the period | Period moves once the renewal payment confirms |
| Paid API | Practice payment returns a one-time reference | Reference issued once the payment to the operator confirms |

## External services

| Service | Required | Privacy note |
| --- | --- | --- |
| Postgres | Yes on Vercel | Stores operation metadata and ciphertext |
| lightwalletd | Yes, for testnet and mainnet | Learns which blocks and transactions ASH asks about, from the function's IP |
| Wallet | No, for the simulated demo | Sees anything the user asks it to pay |
| Vercel | Only if you deploy there | Request logs and function environment |

No lightwalletd, no custodial payment processor, and no object store are configured. Ciphertext is in Postgres. For larger files than 256 KiB, a later version would need a blob store. Keys would still stay with the parties.

## After deployment

`pnpm smoke` runs the steps below and about sixty other checks against any running ASH, and adapts to its network and mode:

```bash
ASH_BASE_URL=https://ash-nu-khaki.vercel.app pnpm smoke
```

It creates demo records on that deployment. Run it once per mode with `SMOKE_MODE=practice`, `testnet`, and `mainnet`. Manual steps:

1. `GET /api/ash/health` returns `status: "ok"`, `usingDevSecrets: false`, `viewingKeySecretSet: true`, and `store: "postgres"`.
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

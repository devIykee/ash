# Contributing

## Setup

Node 20 or newer. This workspace uses pnpm 12.15.0, as recorded in `packageManager`.

```bash
pnpm install
cp .env.example .env.local
pnpm test
pnpm typecheck
pnpm lint
pnpm dev
```

`pnpm verifyDepsBeforeRun` is false so a test run does not fail on ignored native build scripts for packages the app does not need at runtime.

## Layout

| Path | Role |
| --- | --- |
| `src/domain` | Money, states, payment policy |
| `src/zcash` | Addresses, ZIP-321, Sapling note decryption, unified encodings, lightwalletd, payment verification |
| `src/crypto` | AES-GCM, Shamir, signatures, the sum proof |
| `src/services` | Workflows. New payment code goes through `settleSimulated` or `settleObserved` |
| `src/server` | Config, cookies, HTTP, the dispatcher |
| `src/store` | Memory, JSON file, Postgres |
| `app` | Routes and the workspace |
| `packages/sdk` | Client helpers |
| `agents/demo-agent.ts` | Deterministic demo |
| `tests` | Vitest |
| `docs` | Behavior of this tree, not a roadmap |

## Conventions

- Amounts are decimal strings at the edge and bigint zatoshi inside. Do not use `number` for ZEC.
- Reject new states in `src/domain/machine.ts` instead of checking only in a component.
- Request schemas use Zod `.strict()` so a viewing key or a content key cannot ride along as an extra field.
- Do not log request bodies, tokens, seeds, or file keys.
- Client encryption stays in client components. Do not decrypt offer plaintext in a server component.
- If a feature is simulated or partial, say so in the UI and in `docs/MODULES.md`.
- Tests live in `tests/*.test.ts` and should fail when a secret field appears in an event.

## Tests

`pnpm test` runs Vitest in one process so the store singleton can be replaced. Add a case next to the module you change. Run `pnpm typecheck`, `pnpm lint`, and `pnpm build` before you call the work done.

## Secrets

Never commit `.env`, `.env.local`, a seed, a spending key, or a viewing key. `.env.example` contains empty placeholders only.

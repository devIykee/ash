# Demo

The demo uses testnet-shaped addresses and the simulated payment adapter. It does not broadcast Zcash. Say that while you show it. Health warnings on the overview repeat it.

## Prepare

```bash
pnpm install
pnpm dev
```

Open http://127.0.0.1:3000. The left column signs you in as a persona.

## Central flow: encrypted note

1. Sign in as Noor Hale. Open Commerce, then Publish an offer. Leave the sample text, set a price, and publish. Copy the content key if you might switch browsers. The page stores it in this browser.
2. Sign in as Jules Okonkwo. Open the offer and choose Start purchase. This registers an encryption key. It does not pay.
3. Sign in as Noor again. Open the exchange from Commerce and choose Authorize delivery. Noor splits the key locally. Share 3 is the only share uploaded in the clear of its index, and it is not enough to decrypt.
4. Sign in as Jules. Record the simulated payment. Decrypt and download. The browser saves the file. Compare the result with the plaintext hash on the offer.
5. Open the operation record. Seal evidence. The package says it was not independently verified. Verify it on Operations → Verify evidence. Change one byte and verify again. It fails.

## Payroll

Sign in as Avery. Payments → New run. The two addresses are fixtures. Validate, authorize, then execute. Both lines become verified and the run completes. Sign in as Sam. The same run shows totals and hides recipient lines.

## Tip and receipt

Sign in as Noor. Payments → New tip page. Open the ZIP-321 link and note that it does not pay by itself. Record a simulated tip with the memo box unchecked. Open the receipt. It has the amount and the verification level `simulated`, and no memo, and no viewing key.

## Paid API

Sign in as Jules. Agents → Run one paid request. The first response is a 402 challenge. The note appears after payment. Running it again creates a new challenge because the old reference is spent.

## Agent

In another terminal, with the server still running:

```bash
pnpm agent:demo
```

The script buys a new note as an agent token, refuses a replayed API payment, and writes `demo-output/research-note.txt`.

## Memo and grant

Privacy tools → Memo linter. The sample memo flags an email and an invoice. Preview the cleanup, then choose Use cleaned memo only if you want the replacement. Record counts and confirm the memo is not in the request.

As Avery, create a filtered-report grant for Sam. The disclosure says ASH cannot revoke a viewing key. Withdraw it as Avery and sign in as Sam. The report text is gone from the application. The screen still says a real key would remain usable.

## Subscription

As Noor, publish the research feed. As Jules, subscribe and renew. The state becomes completed. Cancel it and renew again. Renewal is rejected.

## What not to claim

Do not say the payment was confirmed on testnet. Do not say the file trade is atomic. Do not say Sam received a viewing key. Do not say the sum proof is a Zcash proof.

# ASH: Zcash hackathon submission

## Problem

Private payments still leak through memos, recipient lists, viewing keys, and screenshots. Agents that buy data or call paid APIs need the same operation model as a person, without a seed phrase in a prompt and without a public subscriber list. A Zcash transaction and an encrypted file are not, by themselves, an atomic trade.

## Solution

ASH is one workspace for that operation: define the parties and the price, authorize, pay through a shielded-first adapter, verify, deliver or grant access, reconcile, and export a small evidence package.

The demo payment adapter is simulated and labeled. Chain mode can ask a node whether a transaction id exists. It cannot see a shielded amount, and it cannot unlock delivery. Receipts, grants, and evidence say what they actually prove.

## Zcash integration

- Testnet by default. No spending keys on the server.
- Structural checks for Sapling and unified addresses. Transparent and Sprout destinations are rejected.
- ZIP-321 payment requests for tip pages.
- Integer zatoshi amounts.
- Honest NU6.3 behavior: Orchard-protocol payments settle into Ironwood, Sapling still accepts value, and ASH does not build the transaction.
- Viewing-key screens describe UFVK and UIVK scope and refuse to store the key. Application expiry is not revocation.
- FROST is not used. It is a threshold signature protocol, not escrow.

## Privacy architecture

Files are encrypted in the browser with AES-256-GCM. The content key is split with Shamir 2-of-3. The server holds share 3 only. Buyers decrypt locally. A ristretto255 Pedersen proof shows a payroll total without putting recipient rows in the auditor's report. The proof is not a Halo 2 or Zcash proof. Evidence packages are signed, separate facts from claims, and can be sealed to an arbiter key.

## Feature scope

| Area | State |
| --- | --- |
| Shared operation lifecycle | Implemented |
| Payroll, tips, 402 API, subscriptions, memo linter, evidence | Implemented on the simulated adapter |
| Encrypted exchange | Implemented prototype with explicit trust assumptions |
| Viewing-key grants | Partial. Disclosures and filtered reports only |
| Chain verification of shielded amount | Not implemented |
| Wallet broadcast, FROST, automatic shielded debit | Planned |
| Hosted demo | Not deployed |

## Demo

Placeholder URL: `https://ash.example.invalid`

Placeholder video: `https://video.example.invalid/ash`

Local steps are in [docs/DEMO.md](docs/DEMO.md). Sign in as Noor, Jules, and Avery and run the encrypted-note purchase, or run `pnpm agent:demo` against `pnpm dev`.

## Tracks

The work sits across Shielded Payments (payroll, tips, subscriptions, the payment adapter), Core & Tooling (memo linter, ZIP-321, viewing-key disclosures, the sum proof), and a wildcard agent API with a shielded 402 challenge. The data exchange is a cross-flow only in the sense that delivery is conditional on the payment record. It does not bridge another chain.

## Status

The statements above match the code in this repository. Simulated payments are labeled in the product and in receipts. Where a control is only an application rule, the docs say so.

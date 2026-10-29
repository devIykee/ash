# ASH: Zcash hackathon submission

## Problem

Private payments still leak through memos, recipient lists, viewing keys, and screenshots. Agents that buy data or call paid APIs need the same operation model as a person, without a seed phrase in a prompt and without a public subscriber list. A Zcash transaction and an encrypted file are not, by themselves, an atomic trade.

## Solution

ASH is one workspace for that operation: define the parties and the price, authorize, pay through a shielded-first adapter, verify, deliver or grant access, reconcile, and export a small evidence package.

ASH runs in three modes, switched in the app: Practice (labeled practice payments), Testnet, and Mainnet. In Testnet and Mainnet, payments are real shielded Zcash transactions sent from the payer's own wallet. ASH finds them through lightwalletd, decrypts them with the payee's viewing key, checks the amount, recipient, memo reference, and note commitment, and unlocks the item after enough confirmations. ASH never holds a spending key. People without a wallet can create one in their browser and keep the recovery phrase. Receipts, grants, and evidence say what they actually prove.

## Zcash integration

- Practice, Testnet, and Mainnet modes. Real payments are verified on chain on both networks. No spending keys on the server.
- Sapling note decryption and note-commitment checks, outgoing-note recovery for payroll, F4Jumble and unified address and viewing key parsing, and ZIP 32 key derivation with FF1 diversifiers, all tested against the official zcash-test-vectors.
- Payment requests with a unique memo reference, a ZIP-321 link, and a QR code. Each on-chain output can satisfy one request only.
- In-browser wallet creation (BIP 39, ZIP 32 account 0). The phrase never leaves the browser and restores in Zashi or YWallet.
- Transparent and Sprout destinations are rejected.
- Integer zatoshi amounts.
- Honest NU6.3 behavior: Orchard-protocol payments settle into Ironwood, Sapling still accepts value, and ASH does not build the transaction.
- Receiving keys are sealed with AES-256-GCM, never returned by the API, and checked to derive the pasted address. Audit-grant screens still refuse to store a viewing key for a reviewer. Application expiry is not revocation.
- FROST is not used. It is a threshold signature protocol, not escrow.

## Privacy architecture

Files are encrypted in the browser with AES-256-GCM. The content key is split with Shamir 2-of-3. The server holds share 3 only. Buyers decrypt locally. A ristretto255 Pedersen proof shows a payroll total without putting recipient rows in the auditor's report. The proof is not a Halo 2 or Zcash proof. Evidence packages are signed, separate facts from claims, and can be sealed to an arbiter key.

## Feature scope

| Area | State |
| --- | --- |
| Shared operation lifecycle | Implemented |
| Payroll, tips, 402 API, subscriptions, file exchange | Implemented in practice, testnet, and mainnet. Real payments are verified on chain |
| Memo linter, evidence packages | Implemented |
| In-browser wallet creation | Implemented (Sapling account; the phrase stays in the browser) |
| Encrypted exchange | Implemented prototype with explicit trust assumptions |
| Viewing-key audit grants | Partial. Disclosures and filtered reports only |
| Orchard and Ironwood note verification | Not implemented. Requests use Sapling receivers |
| Transaction construction and broadcast by ASH, FROST, automatic shielded debit | Not implemented. The payer's wallet broadcasts |
| Hosted demo | https://ash-nu-khaki.vercel.app |

## Demo

URL: https://ash-nu-khaki.vercel.app

Repository: https://github.com/devIykee/ash

Video: submitted with the entry.

Local steps are in [docs/DEMO.md](docs/DEMO.md). The live site checks itself with `ASH_BASE_URL=https://ash-nu-khaki.vercel.app SMOKE_MODE=testnet pnpm smoke` (also `practice` and `mainnet`).

## Tracks

The work sits across Shielded Payments (payroll, tips, subscriptions, the payment adapter), Core & Tooling (memo linter, ZIP-321, viewing-key disclosures, the sum proof), and a wildcard agent API with a shielded 402 challenge. The data exchange is a cross-flow only in the sense that delivery is conditional on the payment record. It does not bridge another chain.

## Status

The statements above match the code in this repository. Practice payments are labeled in the product and in receipts, and they can never satisfy a testnet or mainnet record. Where a control is only an application rule, the docs say so. Demo personas have no password, so a public deployment should not take real mainnet payments without real accounts.

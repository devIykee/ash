# Zcash integration

ASH has three modes, switched in the app (sidebar or top of the screen on phones):

| Mode | Payments | Verification |
| --- | --- | --- |
| Practice | Labeled practice records. Nothing is sent. | None needed. |
| Testnet | Real Zcash testnet transactions from the payer's wallet. | On chain, with the payee's viewing key. |
| Mainnet | Real Zcash mainnet transactions from the payer's wallet. | On chain, with the payee's viewing key. |

Each mode is its own workspace. Records, offers, plans, and tip pages created in one mode are listed only in that mode.

## How a real payment works

1. The payee adds a receiving address and a viewing key for it under **Receiving keys**. ASH checks that the key derives the address (`pk_d = [ivk] DiversifyHash(d)`), that both are for the selected network, and rejects spending keys. The key is sealed with AES-256-GCM under `VIEWING_KEY_SECRET` and never returned.
2. Starting a payment creates a payment request: the payee's Sapling receiver, the amount in zatoshi, and a unique memo `ASH <ref>`. The app shows a ZIP-321 link and a QR code.
3. The payer's own wallet (Zashi, YWallet, or any wallet that honors ZIP-321 memos) builds, signs, and broadcasts the transaction. ASH never holds a spending key and cannot move funds.
4. ASH finds the payment. It either scans new compact blocks from lightwalletd or checks a transaction id the payer pastes. Every Sapling output is trial-decrypted with the payee's incoming viewing key. A note counts only when all of these hold:
   - it decrypts under the key and pays the requested Sapling receiver,
   - its note commitment recomputes to the on-chain `cmu` (so a sender cannot claim a larger amount inside the ciphertext),
   - the ephemeral key is derived from `rseed` as ZIP 212 requires,
   - the value is at least the requested amount,
   - the memo contains the request's reference,
   - the output has not already satisfied another request.
5. Once the transaction has the required confirmations, the flow unlocks: the tip receipt is signed, the file's release envelope is served, the subscription period moves, or the paid API reference is issued.

Payroll runs the other way. The operator pays each line from their wallet (one ZIP-321 link can pay all unpaid lines), then gives ASH the transaction id. ASH recovers the wallet's outgoing notes with the operator's outgoing viewing key (from a full viewing key) and marks each line paid when a note to that line's Sapling address carries at least its amount.

## Confirmations

| Network | Default | Setting |
| --- | --- | --- |
| Testnet | 1 | `ASH_CONFIRMATIONS_TESTNET` |
| Mainnet | 3 | `ASH_CONFIRMATIONS_MAINNET` |

`ASH_REQUIRED_CONFIRMATIONS` sets both when the specific values are absent. A seen but unconfirmed payment shows as "seen" and unlocks nothing.

## Chain access and trust

ASH reads the chain through lightwalletd over gRPC (HTTP/2). Defaults: `https://testnet.zec.rocks:443` and `https://zec.rocks:443`. Override with `ASH_LIGHTWALLETD_TESTNET` and `ASH_LIGHTWALLETD_MAINNET`.

ASH trusts lightwalletd to report block heights and transaction bytes honestly, as any light client that does not validate headers does. Amounts, recipients, and memos are verified cryptographically, so lightwalletd cannot invent a payment that decrypts to the payee's key and matches its commitment. It could hide a payment or misreport confirmations. Run your own lightwalletd for higher assurance.

## Pools

ASH verifies Sapling notes. Payment requests always use the Sapling receiver of the payee's address, so a unified address must include a Sapling receiver. Wallets paying a Sapling address create a Sapling output even when they spend from Orchard. Orchard and Ironwood note verification is not implemented.

Transactions are parsed in the v4, v5, and v6 formats. Testnet v6 transactions use the v5 layout up to the Sapling outputs (checked against live data). A misread can only fail closed, because every note must match its on-chain commitment.

## What is checked against official vectors

`tests/sapling.test.ts` and `tests/unified.test.ts` run the zcash-test-vectors for Sapling generators, key components (ak, nk, ivk, pk_d, note commitments), note encryption with ivk and ovk (full and compact ciphertexts), F4Jumble, unified addresses, and unified full and incoming viewing keys. `tests/networks.test.ts` runs every flow on both networks against genuinely encrypted notes, including wrong memos, short amounts, forged commitments, unconfirmed payments, and reused outputs.

## ZIP-321

Active ZIP-321 uses a `zcash:` URI. A single payment puts the address in the hier-part. Multiple payments use `address.1`, `address.2`. `amount` is a decimal ZEC string with at most 8 fractional digits. `memo` is unpadded base64url and is invalid on a transparent address.

## Viewing keys and audit grants

Receiving keys are separate from audit grants. A receiving key lets ASH confirm payments into that account. It reveals every payment into the account, so a dedicated receiving account is advised. Audit grants remain disclosures: ASH never stores a viewing key for a reviewer, and an application expiry does not revoke a key someone copied.

## Not implemented

ASH does not construct or broadcast transactions, hold spending keys, derive diversified addresses, verify Orchard or Ironwood notes, validate block headers, or perform FROST threshold signing.

# Zcash integration

Network default: testnet. Set `ASH_ZCASH_NETWORK=mainnet` only when you mean it. This build does not broadcast on either network.

Researched against the public protocol as of 26 October 2026, after NU6.3 Ironwood activation (block 3,428,143 on 28 July 2026).

## What ASH implements

| Capability | In this build |
| --- | --- |
| Shielded address structure | Sapling and unified addresses are checked for prefix, checksum, and plausible length |
| Transparent destinations | Rejected for payroll, tips, and the pay-to address |
| Sprout | Rejected |
| ZIP-321 | Built and parsed for one or many payments: address, decimal ZEC amount, unpadded base64url memo up to 512 bytes, label, message |
| Transaction construction | Not implemented. A wallet must build the transaction |
| Spending keys | Not stored and not requested |
| Chain verification | Optional `getrawtransaction`. Existence and confirmation count only |
| Diversified addresses | Not derived. Callers paste an address their wallet produced |
| Viewing keys | Not stored. Grant screens describe what a UFVK or UIVK actually reveals |
| FROST (ZIP-312) | Not implemented |

## Shielded pools

NU6.3 sealed the Orchard pool for ordinary inter-user transfers. Wallets that pay an Orchard-protocol receiver now put value into the Ironwood pool. ZIP 326 says the same Orchard-protocol incoming viewing key trial-decrypts Orchard and Ironwood notes. Sapling still accepts new value. The Sprout freeze is a separate, later event and ASH already rejects Sprout addresses.

ASH does not reverse ZIP-316 F4Jumble, so a unified address checksum does not tell ASH whether the receivers are Sapling, Orchard-protocol, or transparent. The interface says that. A wallet may still reject an address that passed ASH's structural check, including a Sapling diversifier that is not a Jubjub point.

## ZIP-321

Active ZIP-321 uses a `zcash:` URI. A single payment puts the address in the hier-part. Multiple payments use `address.1`, `address.2`, with no leading zeros. `amount` is a decimal ZEC string with at most 8 fractional digits. `memo` is unpadded base64url and is invalid on a transparent address.

Wallets that support ZIP-321, shielded sends, and exact memo bytes can open the link. ASH does not know whether a particular wallet will preserve the memo. The tip page says the link is a request, not a payment.

The default pay-to and the payroll examples use this unfunded structural testnet fixture:

`ztestsapling1qv2z2dj8tp5h4zuu4klvlc83qgfjgd2x2a58nz5m4j7uahlsqyfzxdz92enh3zv64w7v6mc0v32`

It is not a live recipient. Set `ASH_PAY_TO` to an address you control before asking anyone to pay.

## Viewing keys

A unified full viewing key (`uview`) and a unified incoming viewing key (`uivk`) reveal the account those keys were derived for. They do not spend. They cannot be scoped to one diversifier or one date by the key itself. ASH cannot force a recipient to forget notes they already decrypted. Grant expiry is an application clock. The grant object sets `cryptographicRevocation` to false and `stillUsableCryptographically` to true for `ufvk` and `uivk`.

A filtered report is different. ASH stores text the owner typed and can stop serving it. That is not a chain proof.

## Transaction verification

`observeTransaction` calls `getrawtransaction` with verbose output. A successful result becomes status `observed` with the node's confirmation count. The reason string says the shielded amount and recipient are not visible from that call. A missing RPC URL, an HTTP error, or an RPC error becomes `unresolved`.

`paymentSatisfies` accepts:

- `mode: simulated` and `status: verified`, and only when simulated payments are enabled
- `mode: chain_observation` and `status: confirmed`, with confirmations at least `ASH_REQUIRED_CONFIRMATIONS`

Nothing in `src/zcash/chain.ts` sets `confirmed`. A transaction id, a screenshot, or a confirmation count is not proof of amount or recipient. Do not treat an unconfirmed observation as final. Shielded transactions are not instant, and a zero-confirmation policy is not offered.

## Payment adapter modes

`ASH_PAYMENT_MODE=simulated` writes a labeled ledger row and a synthetic id prefixed with `sim_`. The receipt verification level is `simulated`.

`ASH_PAYMENT_MODE=chain` disables the simulated settle path. Callers must pass a 64-character transaction id. The resulting status is `observed` or `unresolved`, and release rules fail closed.

## Unsupported

Broadcast, PCZT, lightwalletd, ZIP-321 request acknowledgements from a wallet, diversified address derivation, viewing-key trial decryption, payment detection from a viewing key, Orchard/Ironwood note construction, and FROST threshold signing.

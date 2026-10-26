# Privacy

ASH prefers shielded Zcash for payment instructions and avoids publishing a subscriber list or a recipient list. It does not provide full anonymity or untraceability. Application metadata is visible to the ASH operator.

## Who sees what

| Party | Can see | Does not get |
| --- | --- | --- |
| Seller | Their offer text, ciphertext, and the content key they kept | The buyer's wallet |
| Buyer | Public offer metadata, their own exchange, the package after payment | Other buyers, the seller's other files |
| Server operator | Accounts, operation ids, amounts submitted to ASH, ciphertext sizes and hashes, event log, the mediator share | Spending keys, content keys, viewing keys, memo text from the linter |
| Payment verifier in simulated mode | The ledger row ASH wrote | A chain transaction, because none was broadcast |
| Chain RPC operator, if configured | That ASH asked about a transaction id | Shielded amount, recipient, and memo from `getrawtransaction` |
| Wallet provider | Whatever the user asks that wallet to build, including a ZIP-321 memo | ASH's other operations |
| Auditor | Payroll totals, line counts, sum proof, grant text while a filtered grant is active | Recipient rows, payment objects on the operation detail |
| External host | Standard request logs, database contents, and timing | Keys that never left the browser |

## Shielded transactions and everything else

A shielded transaction hides the amount, memo, and participants from the public chain to the extent the pool and the wallet do. The recipient of a memo can read that memo. A viewing key reveals the notes it can trial-decrypt, across diversifiers. A wallet provider or lightwalletd sees the requests the wallet makes. ASH sees the fields typed into ASH: names, amounts, addresses, offer descriptions, and ciphertext length.

Publishing an offer leaks the seller display name, title, description, price, plaintext hash, ciphertext hash, and size. The ciphertext itself is omitted from the public listing and is returned to the seller and, after payment, to the buyer.

## Receipts

An `ash-receipt-v1` document contains the approved fields only: format, id, tip id, network, amount, optional memo, verification level, verification statement, the field list, and the time. The memo is included only when the supporter checks that box. There is no viewing key field. A third party with the document can verify the Ed25519 signature. They cannot, from the signature alone, see the chain. If the level is `simulated`, the honest reading is that ASH recorded a local payment.

## Grants

Choosing `uivk` or `ufvk` creates a written disclosure. ASH does not collect the key, so the auditor does not gain chain vision from ASH. If the owner later transmits a real key through some other channel, ASH cannot expire that copy. Choosing `filtered_report` stores the report text and shows it to the auditor until the grant is withdrawn or the application clock passes.

## Subscriptions and tips

Public plan listings show the provider's persona name, title, description, price, and interval. They do not list customers. Renewal URLs are operation ids. The operation page requires the customer or the provider. Tip pages are intentionally public because they are a payment request. They show the address the creator entered.

## Memos

The linter reads the textarea locally. The optional "record counts" request sends finding counts and the rules version. The schema rejects a `memo` field.

## Agents

Agent tokens are shown once. Logs should not contain them. The demo agent keeps the device private key and the content key in process memory and writes the decrypted note under `demo-output/`, which is gitignored. It does not write a seed phrase.

## Browser storage

`localStorage` holds the device private key and content keys. That is not a durable backup. Clearing site data, or using another browser, loses the ability to decrypt. Download the content key when the offer is published.

## Hosting

On Vercel, Postgres holds the same metadata as the local JSON file. Vercel and the database host can read it. Function logs are written to avoid request bodies. Dev signing secrets are obvious strings and the health endpoint warns when they are in use.

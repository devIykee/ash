# Modules

All eight modules call `src/services/*` and the shared operation helpers in `src/services/events.ts` and `src/services/common.ts`. Status words mean:

- **Implemented:** the workflow runs and is covered by tests.
- **Simulated:** the payment did not touch a Zcash network.
- **Partially implemented:** a real subset is present and the missing part is named.
- **Planned:** not built.

## A. Shielded payroll

**Status:** implemented workflow, simulated payments.

An operator creates lines with a label, a shielded address, and a ZEC amount. ASH checks the address structure, rejects duplicates and bad amounts, and stays in `draft` when any line is invalid. A valid batch moves to `validated` and may include a Pedersen sum proof. The operator authorizes, then executes. Each line is paid through the adapter. Fees are `10000` zatoshi per line, an estimate, stored apart from the amount. A failed line can be retried with a new attempt key. The run cannot be completed while a line is unresolved. Sam Ibarra's report has totals and counts and no recipient rows.

**Limitation:** addresses are not diversified by ASH. Chain mode does not build the transactions.

## B. Private tips and receipts

**Status:** implemented. Payment is simulated unless a transaction id is submitted for observation.

A creator publishes a page. ASH returns a ZIP-321 URI for a suggested amount. A supporter pays through the simulated adapter, or submits a transaction id. A verified simulated payment produces `ash-receipt-v1` with only the approved fields. Observation does not produce a receipt. The signature can be checked by anyone who has the receipt. The verification level says what was actually checked.

**Limitation:** a receipt is not an independent chain proof.

## C. Shielded x402 API

**Status:** implemented as an ASH extension of x402 v2. Not an official x402 scheme.

`GET /api/v1/paid/research` returns HTTP 402 and a `PAYMENT-REQUIRED` header. The body uses `x402Version: 2`, scheme `zcash-shielded`, network `zcash:testnet` or `zcash:mainnet`, and an amount in zatoshi. `extra.officialX402Scheme` is false. The challenge expires in five minutes and is bound to `/api/v1/paid/research`. `POST /api/ash/challenges/:id/pay` settles it. The retry sends `PAYMENT-SIGNATURE`. A second use returns 409. The 402 response is not a payment.

**Limitation:** there is no registered CAIP-2 identifier for Zcash in the x402 scheme list this build follows. Confirmation latency is why observation does not unlock the route.

## D. Encrypted exchange

**Status:** implemented prototype. Trust assumptions are in [CRYPTOGRAPHY.md](CRYPTOGRAPHY.md).

The browser encrypts, the server stores ciphertext, the seller splits the key, and the buyer decrypts locally. Payment uses the same adapter. Unpaid callers can see that a buyer share exists and cannot see the package.

**Planned:** a wallet-backed payment and any design that does not put a mediator share on the server. FROST is not a substitute and is not implemented.

## E. Audit grants

**Status:** partially implemented.

Owners create a `ufvk`, `uivk`, or `filtered_report` grant. The first two are disclosures of what that key would reveal. The third stores a report and serves it to the auditor until withdrawal or expiry. `cryptographicRevocation` is always false.

**Planned:** nothing that pretends an incoming viewing key can be limited to one diversifier. A real wallet handoff of a key is intentionally absent.

## F. Subscriptions

**Status:** implemented as renewal coordination, not automatic debit.

Providers publish a price and interval. Customers subscribe, then renew with an explicit simulated payment. The same payment id does not extend twice. After the period, the state becomes `grace` and access continues. After grace, the state becomes `expired`, access is restricted, and the row remains. Cancel stops later renewals.

**Planned:** a wallet that actually supports unattended shielded recurring transfers. ASH will not describe the current flow as a debit.

## G. Memo linter

**Status:** implemented, local.

Rules cover email, phone, tracking URLs, credential-like strings, long hex, invoice and account references, ticket ids, labeled personal names, BIP-39 windows, and extra regular expressions. Findings explain the risk. Dismissals are kept in the cleanup proposal. The memo is replaced only after "Use cleaned memo". The server record stores counts.

**Limitation:** pattern matching misses meaning and can flag harmless text. Rules version `ash-memo-1`.

## H. Dispute evidence

**Status:** implemented.

A participant seals the operation state, payment status and mode, transaction reference if any, and the event list. Facts are separated from a claim that is always `verified: false`. The package can be encrypted to an arbiter key generated in the browser. Verification checks the signature and, when claimed, the event hash chain.

**Limitation:** the package reports what ASH stored. It does not create certainty the chain did not provide.

## Shared UI

Overview, Commerce, Payments, Privacy tools, Operations, Agents, and Documentation are separate routes. Each operation also has `/operations/:id` with state, payment, access, disclosures, events, and evidence export.

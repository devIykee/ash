# Operations

Policy version: `ash-policy-2026-10-26`.

## Record

Every operation has an id, a type, a state, an initiator, participants, timestamps, a policy version, disclosures, and an event history. Payment and access objects are present only when that workflow uses them. Type-specific documents hold the rest, so a memo check does not carry payroll lines.

## States

`draft`, `validated`, `authorized`, `awaiting_seller`, `awaiting_payment`, `payment_observed`, `payment_verified`, `executing`, `partially_completed`, `delivered`, `grace`, `delivery_failed`, `recovered`, `disputed`, `completed`, `restricted`, `failed`, `cancelled`, `expired`.

Terminal is defined as a state with no outgoing edge, except `draft`, which can still be waiting for validation. Services add their own guards on top of the edge list. For example, payroll `completed` is rejected while any active line is not `verified`.

## Authorization

Demo sessions are HMAC cookies named `ash_session`, HttpOnly and SameSite=Lax, for 12 hours. Production sets `Secure`. Cookie mutations that send an `Origin` must match `Host`.

Agent requests use `Authorization: Bearer`. A bearer token is resolved before the cookie. Revoked tokens fail. Agents are the owning user for participation checks, plus a scope and a budget.

Roles:

| Persona | Role | Can |
| --- | --- | --- |
| Avery Chen | operator | Payroll, agents, offers, grants |
| Noor Hale | creator | Offers, tips, plans, grants |
| Jules Okonkwo | buyer | Buy, subscribe, pay challenges |
| Sam Ibarra | auditor | Aggregate payroll, grants addressed to Sam |

A participant check is required to read an operation. Sam can also see payroll metadata. Payment objects are removed from Sam's operation detail.

## Idempotency

Creates and payments accept `Idempotency-Key` (`8` to `80` characters, `[A-Za-z0-9:_-]`). The same key and same canonical body return the stored response. The same key and a different body returns 409. Payroll line attempts use `{lineId}:{attempt}` as the ledger key, so a retry does not reuse a rejected attempt.

## Optimistic concurrency

Updates send `expectedVersion`. The store updates only when the stored version matches. Two authorizations of the same version produce one success and one 409. The in-process mutex stops a lost update inside one Node process. Postgres locks the row with `FOR UPDATE`. Two serverless instances still need Postgres, not the JSON file.

## Events

Each change appends an event with type, operation id, time, from-state, to-state, a short note, an optional reference, and a hash of the previous event. The genesis hash is the string `genesis`. `assertNoSecrets` rejects viewing-key-shaped strings and field names such as `viewingKey`, `seedPhrase`, and `contentKey`.

The hash chain is an integrity hint. It is not a tamper-proof log. The process that owns the database, and anyone with the receipt signing secret, can rewrite history and re-sign a new evidence package. The package says this.

## Reconciliation

Payroll is complete only when every non-cancelled line is `verified`. A mix of verified and failed lines is `partially_completed`. Fees are stored per line and summed separately from amounts.

A data exchange is reconciled when the buyer acknowledges local decryption (`delivered`, then `completed`) or finishes recovery (`recovered`, then `completed`).

Subscriptions move `completed` → `grace` → `expired` from the period clock. `expired` restricts access and keeps the row. `cancelled` does not renew.

## Recovery

- Failed payroll line: retry, which increments `attempt`, or cancel that line. A verified line cannot be cancelled.
- Unconfirmed or unmatched payment: the exchange stays unpaid. The payment panel shows why (wrong memo, short amount, or not yet confirmed).
- Delivery failure after an accepted payment: the buyer reports failure and may fetch share 3. Share 3 plus share 1 reconstructs the key. This is not a refund. A refund would be a new outgoing payment.
- Expired API challenge: request the resource again. The old reference cannot be reused.
- Expired grant: ASH stops treating the application as active. A viewing key that was shared outside ASH still works.

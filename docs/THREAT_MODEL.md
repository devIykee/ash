# Threat model

ASH assumes a hostile buyer, seller, or agent, a curious server operator, and a network attacker who can replay requests. It does not assume a compromised browser or a malicious modified frontend. XSS against the origin can bypass client-side encryption because the encryption runs in that origin. The content security policy allows `unsafe-inline` because the Next.js runtime in this setup needs it. That is a residual XSS risk.

Assets: shielded payment intent, recipient addresses, file plaintext, content keys, viewing keys, agent tokens, evidence packages, and the event history.

Out of scope: breaking AES-GCM, X25519, Ed25519, or SHA-256; malware on the user's machine; a wallet that leaks its own seed; a database administrator who rewrites Postgres and forges a new signature with the receipt secret.

## Threats

### Malicious seller or buyer

Assets: the file, the payment, the other party's identity metadata.

Attacker: a participant who lies about delivery, uploads a useless file, or refuses to continue.

Controls: plaintext hash in the package header, buyer-side hash check, delivery-failure state, mediator share only after that report, evidence export of the states ASH actually stored.

Residual: the buyer can report failure after a good delivery and still receive share 3. The protocol does not adjudicate who is honest. A useless plaintext that matches the seller's hash is still "matching". Payment is not clawed back.

Tests: exchange tests for tamper, wrong key, unpaid package, and recovery. Evidence tests.

Unsupported: fair exchange, automatic refunds, arbitration of file quality.

### Dishonest or compromised agent

Assets: the operator's budget and operations.

Attacker: a stolen bearer token, or an agent that tries to authorize itself.

Controls: scopes, zatoshi budget with per-key charges, `assertPerson` on authorize/release/publish, revocable tokens, no seed in the agent API.

Residual: a token with `pay` and `exchange` can buy until the budget is spent. Theft of the token before revocation is enough. The owner user id is the participant, so the agent's actions look like the operator.

Tests: service guards on `assertPerson` and `chargeAgent`. The demo agent uses a budget and does not authorize payroll.

Unsupported: hardware-bound agent keys, per-request human approval in the UI.

### Unauthorized key release

Assets: content key shares.

Attacker: a buyer before payment, or the server alone.

Controls: `exchangePackage` returns the release envelope and ciphertext only when `paymentSatisfies` is true. Share 3 is returned only in `delivery_failed` or `recovered`. Shares 1 and 2 are sealed to the buyer key.

Residual: server compromise plus the buyer who holds share 1 can combine early. A seller who uploads the content key anyway has left the model. ASH's schema rejects a top-level content key on the offer body, not a key hidden inside a description.

Tests: unpaid package has `pack: null`. Wrong recipient box fails.

Unsupported: a threshold that remains safe when the server and the buyer collude.

### Forged payment confirmation

Assets: release of files, API responses, payroll completion, subscription time.

Attacker: a client who sends a transaction id, a screenshot, or a JSON claim.

Controls: simulated mode only settles through `settleSimulated`. A transaction id goes to `settleObserved`, which never satisfies the policy. Client fields cannot set `status: verified`.

Residual: anyone who can write the database can insert a ledger row. The simulated adapter will satisfy policy for anyone the server trusts, by design, and it labels that fact.

Tests: `paymentSatisfies` unit tests, real-payment flows on both networks with wrong memos, short amounts, forged commitments, unconfirmed and reused outputs, and x402 reference mismatch.

Unsupported: proving a shielded amount to ASH without a viewing key or a wallet integration. That integration is not in this build.

### Replay and duplicate fulfillment

Assets: API responses, double payment, double budget spend.

Attacker: a client who repeats a 402 signature or an idempotency key.

Controls: challenge status `fulfilled` returns 409, the reference is bound to the path, idempotency keys replay the same body, ledger keys short-circuit a second charge.

Residual: two different idempotency keys are two payments. That is intentional for a second purchase. A fulfilled challenge cannot be spent again even on the same path.

Tests: x402 replay and path binding, payroll single ledger row, subscription duplicate renewal.

### Payroll partial failure

Assets: contributor funds and the run total.

Attacker: a failed attempt followed by a naive retry that pays twice, or a complete button while lines are open.

Controls: line states, attempt counter, ledger key `{lineId}:{attempt}`, completion guard, failed versus rejected versus verified.

Residual: a payroll line is confirmed only from the operator's outgoing notes, so payments sent from a different wallet account do not count. ASH trusts lightwalletd for block heights.

Tests: payroll module test.

### Viewing-key over-disclosure

Assets: the wallet history a key can see.

Attacker: an owner who pastes a key, or an auditor who treats an application expiry as revocation.

Controls: no viewing-key column, request schemas are strict, `uview1` and `uivk1` strings are rejected, events run `assertNoSecrets`, the UI states that cryptographic revocation is false.

Residual: the owner can still export a key through another channel. A filtered report can itself contain sensitive text the owner chose to type.

Tests: grant tests and the API viewing-key field test.

Unsupported: cryptographic revocation, diversifier-scoped keys, date-scoped keys.

### Invalid or expired grants

Controls: future expiry required at creation, read path moves `authorized` to `expired`, filtered text hidden after expiry or withdrawal.

Residual: the application clock is ASH's clock. It does not affect a key held elsewhere.

Tests: grant clock test.

### Compromised client encryption

Attacker: XSS, a malicious extension, or a replaced frontend.

Controls: encryption in the browser with noble, CSP, `nosniff`, frame denial, no third-party scripts in the app source.

Residual: `script-src 'unsafe-inline'` weakens CSP. A compromised origin reads `localStorage` keys. Users should verify the deployment they are using.

Tests: pack tamper and wrong-key tests. There is no automated XSS test.

### Malicious files and oversized uploads

Controls: 256 KiB plaintext cap, chunk bounds, authenticated decryption, hash check. The server never executes the file.

Residual: a decrypted file can still be malware. The download is a normal browser download. Size limits are application checks, not a sandbox.

Tests: pack tamper test. The size cap is in `encryptPack`.

### Server metadata and storage compromise

Controls: least data in events, public offer listings omit ciphertext bytes, health warnings for dev secrets, no seeds in env.

Residual: the database has amounts, addresses, names, and ciphertext. A full database leak is a metadata leak. Share 3 is in that database.

Tests: event secret rejection, memo record without memo text, aggregate report without lines.

### Forged evidence

Controls: signature over canonical JSON, `independentlyVerified` forced false, claims forced `verified: false`, hash chain check when the package claims the chain is intact, secrets rejected.

Residual: the signer can seal a false fact that ASH stored, or reseal after editing the database. The verifier UI says the signature binds bytes, not truth.

Tests: evidence tamper, missing field, independently verified rejection, proof negative test.

### Escrow deadlock

Controls: documented share positions and the recovery transition. The server cannot decrypt alone. The buyer with share 1 can recover without the seller after payment and a failure report.

Residual: buyer who lost share 1 and a seller who disappears cannot recover. Two live parties who refuse to move the state stay stuck. No timeout refund is implemented.

Tests: recovery test. Unavailable-seller behavior is the same stuck state, covered by the protocol description rather than a simulated clock.

### Subscription races

Controls: expected version, idempotency key, applied payment ids, cancel check before settle returns a renewal.

Residual: two different keys extend two periods. That is two payments. Clock refresh uses the server time supplied by the caller in tests and `Date.now` in the API.

Tests: subscription module test.

### Concurrent state changes

Controls: optimistic version and the single-process queue. Postgres row locks.

Residual: the JSON file store is unsafe across multiple processes.

Tests: parallel authorize of one version.

## Unsupported guarantees

ASH does not claim anonymity, atomic swap, trustless escrow, viewing-key revocation, payment finality from a transaction id, or resistance to a malicious server operator who also holds the signing secret.

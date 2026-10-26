# Cryptography

ASH uses maintained libraries for the primitives and does not invent an encryption mode. The compositions below are ordinary applications of those primitives. They are not a new scheme, and they are not Zcash's proof system.

## Libraries

- `@noble/ciphers` 1.3.0, AES-256-GCM
- `@noble/curves` 1.9.7, X25519, Ristretto255, Ed25519
- `@noble/hashes` 1.8.0, SHA-256, SHA-512, HKDF

Randomness comes from the library's CSPRNG (`crypto.getRandomValues` in the noble helpers).

## File package

`encryptPack` generates a 32-byte key if the caller does not pass one. Plaintext is split into 16 KiB chunks, maximum 256 KiB. Each chunk is AES-256-GCM with a fresh 12-byte nonce. Associated data is `ash-pack-v1|{index}|{plaintextSha256}`. The package stores the hex nonce, hex ciphertext, chunk size, and plaintext hash. Decryption checks the authentication tag and then the plaintext hash.

The server stores the package. It does not store the key. A wrong key or a flipped ciphertext byte fails closed.

## Key wrapping

`sealTo` generates an ephemeral X25519 secret, computes the shared secret with the recipient public key, and derives a 32-byte AES key with HKDF-SHA256. Salt is the UTF-8 string `ash-wrap-v1`, info is `x25519-aes-256-gcm`. The box stores version, ephemeral public key, nonce, and ciphertext. Another recipient's private key fails authentication. There is no header that identifies the recipient.

## Conditional delivery

The content key is split with Shamir secret sharing over GF(2^8), polynomial 0x11b, threshold 2. Share indexes are 1 (buyer, sealed before or at release), 2 (release, sealed to the buyer and withheld until payment), and 3 (mediator, stored on the server). The polynomial coefficient is rejected when it is zero, so a single share is not the secret.

This is not FROST (ZIP-312). FROST produces a RedPallas spend authorization signature. It does not hold a file key, refund a payment, or create a fair exchange. ASH does not implement FROST, and it does not keep all three shares on the server.

Two shares reconstruct the key. The server alone has one share. The buyer who saved share 1 can combine it with share 3 after a reported delivery failure. If the buyer never received share 1, and the seller is gone, share 3 is not enough. A Zcash payment cannot be reversed by this protocol. Any refund is a new payment the seller chooses to send.

The server plus a buyer who already has share 1 can reconstruct the key early if the server is compromised, because those are two shares. That collusion is a documented trust assumption, not distributed custody.

## Pedersen sum proof

`proveAmountSum` commits each zatoshi amount as `H·amount + G·blinding` on ristretto255. `G` is the base point. `H` is `hashToRistretto255("ash-pedersen-h-v1")`. A Schnorr proof of knowledge shows that the prover knows a blinding that opens the sum of the commitments to the public total. The challenge is Fiat-Shamir over SHA-512 of the public inputs. The proof object includes `statement` and `doesNotProve`.

The proof shows a numeric sum of committed amounts. It does not show that the amounts were paid, that they match a later payroll, or that the seller's file is honest. It is not Halo 2 and not a Zcash transaction proof. Negative tests change the public total and expect failure.

The operator's server still stores the line amounts so the operator can execute the run. The aggregate view omits recipient rows. The commitments do not hide the amounts from the operator who created them.

## Signatures

Receipts (`ash-receipt-v1`) and evidence (`ash-evidence-v1`) are signed with Ed25519. The 32-byte seed is SHA-256 of the receipt signing secret. The message is canonical JSON with sorted object keys. Verification uses the public key inside the document. A changed field fails verification.

The signature proves that the holder of the signing secret sealed those bytes. It does not prove that a shielded transfer occurred. The receipt's `verificationLevel` says whether the source was the simulated adapter, a chain observation, or an unverified claim. Chain observation does not currently issue a tip receipt.

## Evidence encryption

`ash-evidence-sealed-v1` wraps the signed package to an arbiter X25519 public key with `sealTo`. Opening it requires the arbiter private key, which is generated in the browser and is not stored. Integrity is the signature after decryption, plus the embedded event hash chain when `hashChainOk` is true.

## What is not claimed

Hashes, signatures, authenticated encryption, and database checks are not labeled zero-knowledge proofs. A Zcash payment does not prove a dataset claim. The plaintext hash on an offer is the seller's claim, checked against the package header. The buyer repeats the hash check after local decryption.

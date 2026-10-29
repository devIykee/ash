// Receiving keys: each person adds the address they want to be paid at plus a viewing key for it.
// ASH uses the key only to verify payments into that address. Keys are encrypted at rest and
// never returned by the API.
import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { AshError } from "@/domain/errors";
import { nowIso } from "@/domain/ids";
import type { Network } from "@/domain/types";
import { config } from "@/server/config";
import type { Tx } from "@/store/types";
import { addressMatchesIvk, type SaplingAddress } from "@/zcash/sapling";
import { parseViewingKey, saplingReceiver, type SaplingViewingKey } from "@/zcash/unified";
import { assertPerson, type Actor } from "./common";

type StoredKey = {
  userId: string;
  network: Network;
  /** What the person pasted. May be a unified address. */
  enteredAddress: string;
  /** The Sapling receiver ASH puts in payment requests, so wallets pay a pool ASH can verify. */
  saplingAddress: string;
  source: SaplingViewingKey["source"];
  canVerifyOutgoing: boolean;
  sealed: { iv: string; ciphertext: string };
  updatedAt: string;
};

export type WalletKeySummary = Omit<StoredKey, "sealed" | "userId">;

function sealingKey(): Uint8Array {
  return hkdf(sha256, utf8ToBytes(config().keySecret), utf8ToBytes("ash-viewing-keys"), utf8ToBytes("v1"), 32);
}

function seal(text: string): StoredKey["sealed"] {
  const iv = randomBytes(12);
  return { iv: bytesToHex(iv), ciphertext: bytesToHex(gcm(sealingKey(), iv).encrypt(utf8ToBytes(text))) };
}

function unseal(sealed: StoredKey["sealed"]): string {
  try {
    return new TextDecoder().decode(gcm(sealingKey(), hexToBytes(sealed.iv)).decrypt(hexToBytes(sealed.ciphertext)));
  } catch {
    throw new AshError("key_unavailable", "This viewing key cannot be read with the server's current secret. Add it again in Settings.", 409);
  }
}

const docId = (userId: string, network: Network) => `${userId}:${network}`;

export async function saveWalletKey(tx: Tx, actor: Actor, input: { network: Network; address: string; viewingKey: string }) {
  const user = assertPerson(actor);
  let key: SaplingViewingKey;
  let receiver: ReturnType<typeof saplingReceiver>;
  try {
    key = parseViewingKey(input.viewingKey);
  } catch (error) {
    throw new AshError("invalid_key", error instanceof Error ? error.message : "That viewing key is not valid.");
  }
  try {
    receiver = saplingReceiver(input.address);
  } catch (error) {
    throw new AshError("invalid_address", error instanceof Error ? error.message : "That address is not valid.");
  }
  if (key.network !== input.network) throw new AshError("invalid_key", `That viewing key is for ${key.network}, not ${input.network}.`);
  if (receiver.network !== input.network) throw new AshError("invalid_address", `That address is for ${receiver.network}, not ${input.network}.`);
  if (!receiver.sapling || !receiver.saplingEncoded) {
    throw new AshError("invalid_address", "This address has no Sapling receiver. ASH verifies Sapling payments, so use a Sapling address or a unified address that includes Sapling.");
  }
  if (!addressMatchesIvk(receiver.sapling, key.ivk)) {
    throw new AshError("invalid_key", "That viewing key does not belong to this address. Export both from the same wallet account.");
  }
  const record: StoredKey = {
    userId: user.id,
    network: input.network,
    enteredAddress: input.address.trim(),
    saplingAddress: receiver.saplingEncoded,
    source: key.source,
    canVerifyOutgoing: key.ovk !== null,
    sealed: seal(input.viewingKey.trim()),
    updatedAt: nowIso(),
  };
  const existing = await tx.get<StoredKey>("wallet_key", docId(user.id, input.network));
  await tx.put("wallet_key", docId(user.id, input.network), record, existing ? existing.version : null);
  return summary(record);
}

function summary(record: StoredKey): WalletKeySummary {
  const { sealed: _sealed, userId: _userId, ...rest } = record;
  void _sealed;
  void _userId;
  return rest;
}

export async function listWalletKeys(tx: Tx, actor: Actor): Promise<WalletKeySummary[]> {
  const user = assertPerson(actor);
  const keys = await Promise.all((["testnet", "mainnet"] as const).map((network) => tx.get<StoredKey>("wallet_key", docId(user.id, network))));
  return keys.filter((doc): doc is NonNullable<typeof doc> => Boolean(doc)).map((doc) => summary(doc.data));
}

export async function removeWalletKey(tx: Tx, actor: Actor, network: Network) {
  const user = assertPerson(actor);
  const existing = await tx.get<StoredKey>("wallet_key", docId(user.id, network));
  if (!existing) return { removed: false };
  // Tombstone: the store has no delete. An empty record reads as "no key".
  await tx.put("wallet_key", docId(user.id, network), { removed: true, updatedAt: nowIso() }, existing.version);
  return { removed: true };
}

export type VerifyingKey = { saplingAddress: string; address: SaplingAddress; ivk: bigint; ovk: Uint8Array | null };

/** Loads a person's key for verification. Server-side only. */
export async function verifyingKey(tx: Tx, userId: string, network: Network): Promise<VerifyingKey | null> {
  const doc = await tx.get<StoredKey & { removed?: boolean }>("wallet_key", docId(userId, network));
  if (!doc || doc.data.removed || !doc.data.sealed) return null;
  const key = parseViewingKey(unseal(doc.data.sealed));
  const receiver = saplingReceiver(doc.data.saplingAddress);
  if (!receiver.sapling) return null;
  return { saplingAddress: doc.data.saplingAddress, address: receiver.sapling, ivk: key.ivk, ovk: key.ovk };
}

/** The Sapling address a person is paid at on this network, without decrypting their key. */
export async function payoutAddress(tx: Tx, userId: string, network: Network): Promise<string | null> {
  const doc = await tx.get<StoredKey & { removed?: boolean }>("wallet_key", docId(userId, network));
  if (!doc || doc.data.removed || !doc.data.saplingAddress) return null;
  return doc.data.saplingAddress;
}

import { bech32, bech32m } from "bech32";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { AshError } from "@/domain/errors";
import type { Network } from "@/domain/types";

export type AddressKind = "sapling" | "unified" | "transparent" | "unsupported";

export type AddressReport = {
  address: string;
  kind: AddressKind;
  network: Network | null;
  shielded: boolean;
  memoCapable: boolean;
  note: string;
};

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const TRANSPARENT: Record<string, { network: Network; p2sh: boolean }> = {
  "1cb8": { network: "mainnet", p2sh: false },
  "1cbd": { network: "mainnet", p2sh: true },
  "1d25": { network: "testnet", p2sh: false },
  "1cba": { network: "testnet", p2sh: true },
};

function decodeBase58(value: string): Uint8Array | null {
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)) return null;
  let num = 0n;
  for (const char of value) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) return null;
    num = num * 58n + BigInt(index);
  }
  const hex = num.toString(16).padStart(2, "0");
  const bytes = new Uint8Array(Math.ceil(hex.length / 2));
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  let zeros = 0;
  while (zeros < value.length && value[zeros] === "1") zeros += 1;
  const out = new Uint8Array(zeros + bytes.length);
  out.set(bytes, zeros);
  return out;
}

function transparentReport(address: string): AddressReport | null {
  const decoded = decodeBase58(address);
  if (!decoded || decoded.length < 6) return null;
  const payload = decoded.slice(0, -4);
  const check = decoded.slice(-4);
  const hashed = sha256(sha256(payload));
  if (![0, 1, 2, 3].every((index) => hashed[index] === check[index])) return null;
  if (payload.length !== 22) return null;
  const version = bytesToHex(payload.slice(0, 2));
  const known = TRANSPARENT[version];
  if (!known) return null;
  return {
    address,
    kind: "transparent",
    network: known.network,
    shielded: false,
    memoCapable: false,
    note: "Transparent addresses publish the recipient and amount. Shielded memos are not available.",
  };
}

export function inspectAddress(address: string, expected?: Network): AddressReport {
  const value = address.trim();
  if (!value) throw new AshError("invalid_address", "Payment address is required.");
  if (value.startsWith("zc")) {
    throw new AshError("invalid_address", "Sprout addresses are not supported.");
  }

  const transparent = transparentReport(value);
  if (transparent) {
    if (expected && transparent.network !== expected) {
      throw new AshError("invalid_address", `Address is for ${transparent.network}, not ${expected}.`);
    }
    return transparent;
  }

  if (value.startsWith("zs1") || value.startsWith("ztestsapling1")) {
    let decoded: { prefix: string; words: number[] };
    try {
      decoded = bech32.decode(value, 512);
    } catch {
      throw new AshError("invalid_address", "Sapling address checksum is invalid.");
    }
    const network: Network | null =
      decoded.prefix === "zs" ? "mainnet" : decoded.prefix === "ztestsapling" ? "testnet" : null;
    if (!network) throw new AshError("invalid_address", "Unknown Sapling address prefix.");
    const payload = bech32.fromWords(decoded.words);
    if (payload.length !== 43) {
      throw new AshError("invalid_address", "Sapling address payload has the wrong length.");
    }
    if (expected && network !== expected) {
      throw new AshError("invalid_address", `Address is for ${network}, not ${expected}.`);
    }
    return {
      address: value,
      kind: "sapling",
      network,
      shielded: true,
      memoCapable: true,
      note: "Structural Sapling check only. ASH does not prove the diversifier is a Jubjub point a wallet will accept. Sapling still accepts new value after NU6.3.",
    };
  }

  if (value.startsWith("u1") || value.startsWith("utest1")) {
    let decoded: { prefix: string; words: number[] };
    try {
      decoded = bech32m.decode(value, 512);
    } catch {
      throw new AshError("invalid_address", "Unified address checksum is invalid.");
    }
    const network: Network | null = decoded.prefix === "u" ? "mainnet" : decoded.prefix === "utest" ? "testnet" : null;
    if (!network) throw new AshError("invalid_address", "Unknown unified address prefix.");
    const payload = bech32m.fromWords(decoded.words);
    if (payload.length < 16 || payload.length > 400) {
      throw new AshError("invalid_address", "Unified address payload length is not plausible.");
    }
    if (expected && network !== expected) {
      throw new AshError("invalid_address", `Address is for ${network}, not ${expected}.`);
    }
    return {
      address: value,
      kind: "unified",
      network,
      shielded: true,
      memoCapable: true,
      note: "Checksum and network only. ASH does not reverse ZIP-316 F4Jumble, so it cannot see whether this unified address contains a Sapling receiver, an Orchard-protocol receiver, or a transparent receiver. Current wallets pay an Orchard-protocol receiver into the Ironwood pool.",
    };
  }

  throw new AshError(
    "invalid_address",
    "Use a Sapling address or a unified address. Transparent and Sprout destinations are rejected for shielded operations.",
  );
}

export function assertShieldedDestination(address: string, network: Network): AddressReport {
  const report = inspectAddress(address, network);
  if (!report.shielded) {
    throw new AshError("invalid_address", "Shielded operations reject transparent addresses.");
  }
  return report;
}

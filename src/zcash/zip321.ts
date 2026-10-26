import { AshError } from "@/domain/errors";
import { zatoshiToZec, zecToZatoshi } from "@/domain/money";
import { inspectAddress } from "./address";
import type { Network } from "@/domain/types";

export type Zip321Payment = {
  index: string;
  address: string;
  amountZatoshi: bigint | null;
  memoText: string | null;
  label: string | null;
  message: string | null;
};

const PARAM_RE = /^([A-Za-z][A-Za-z0-9+-]*)(?:\.([1-9][0-9]{0,3}))?$/;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  if (value.length === 0) return new Uint8Array();
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new AshError("invalid_payment_uri", "ZIP-321 memos are unpadded base64url.");
  }
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeQueryValue(value: string): string {
  return encodeURIComponent(value);
}

function decodeQueryValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new AshError("invalid_payment_uri", "A ZIP-321 parameter is not valid percent-encoding.");
  }
}

type Group = {
  address?: string;
  amount?: string;
  memo?: string;
  label?: string;
  message?: string;
};

export function buildZip321(
  payments: {
    address: string;
    amountZatoshi: bigint;
    memo?: string;
    label?: string;
    message?: string;
  }[],
  network?: Network,
): string {
  if (payments.length === 0) throw new AshError("invalid_payment_uri", "A payment request needs a recipient.");
  if (payments.length > 50) throw new AshError("invalid_payment_uri", "Too many payments for one ZIP-321 request.");

  const encoded = payments.map((payment, position) => {
    const report = inspectAddress(payment.address, network);
    if (payment.memo && !report.memoCapable) {
      throw new AshError("invalid_payment_uri", "ZIP-321 rejects a memo on a transparent address.");
    }
    const memoBytes = payment.memo ? new TextEncoder().encode(payment.memo) : null;
    if (memoBytes && memoBytes.length > 512) {
      throw new AshError("invalid_payment_uri", "A Zcash memo cannot exceed 512 bytes.");
    }
    const index = payments.length === 1 ? "" : `.${position + 1}`;
    const params = [`address${index}=${payment.address}`, `amount${index}=${zatoshiToZec(payment.amountZatoshi)}`];
    if (memoBytes) params.push(`memo${index}=${bytesToBase64Url(memoBytes)}`);
    if (payment.label) params.push(`label${index}=${encodeQueryValue(payment.label)}`);
    if (payment.message) params.push(`message${index}=${encodeQueryValue(payment.message)}`);
    return { address: payment.address, params, single: payments.length === 1 };
  });

  if (encoded.length === 1 && encoded[0].single) {
    const params = encoded[0].params.filter((param) => !param.startsWith("address="));
    return `zcash:${encoded[0].address}?${params.join("&")}`;
  }
  return `zcash:?${encoded.flatMap((item) => item.params).join("&")}`;
}

export function parseZip321(uri: string, network?: Network): Zip321Payment[] {
  if (!uri.startsWith("zcash:")) throw new AshError("invalid_payment_uri", "URI must start with zcash:.");
  const rest = uri.slice("zcash:".length);
  const split = rest.indexOf("?");
  const hier = split === -1 ? rest : rest.slice(0, split);
  const query = split === -1 ? "" : rest.slice(split + 1);
  if (hier.includes("/")) throw new AshError("invalid_payment_uri", "ZIP-321 has no path.");

  const groups = new Map<string, Group>();
  const touch = (index: string): Group => {
    const existing = groups.get(index);
    if (existing) return existing;
    const created: Group = {};
    groups.set(index, created);
    return created;
  };

  if (hier) touch("").address = hier;
  if (query) {
    for (const part of query.split("&")) {
      if (!part) continue;
      const eq = part.indexOf("=");
      const rawKey = eq === -1 ? part : part.slice(0, eq);
      const rawValue = eq === -1 ? "" : part.slice(eq + 1);
      const match = PARAM_RE.exec(rawKey);
      if (!match) throw new AshError("invalid_payment_uri", `Unsupported parameter ${rawKey}.`);
      const name = match[1];
      const index = match[2] ?? "";
      const group = touch(index);
      if (name === "address" || name === "amount" || name === "memo" || name === "label" || name === "message") {
        if (group[name] !== undefined) {
          throw new AshError("invalid_payment_uri", `Duplicate ${name} parameter.`);
        }
        group[name] = rawValue;
      }
    }
  }

  if (groups.size === 0) throw new AshError("invalid_payment_uri", "Payment request is empty.");
  const payments: Zip321Payment[] = [];
  for (const [index, group] of groups) {
    if (!group.address) throw new AshError("invalid_payment_uri", "A payment is missing its address.");
    const report = inspectAddress(group.address, network);
    let memoText: string | null = null;
    if (group.memo !== undefined) {
      if (!report.memoCapable) {
        throw new AshError("invalid_payment_uri", "ZIP-321 rejects a memo on a transparent address.");
      }
      const bytes = base64UrlToBytes(group.memo);
      if (bytes.length > 512) throw new AshError("invalid_payment_uri", "Memo exceeds 512 bytes.");
      memoText = new TextDecoder().decode(bytes);
    }
    payments.push({
      index,
      address: group.address,
      amountZatoshi: group.amount === undefined ? null : zecToZatoshi(group.amount),
      memoText,
      label: group.label === undefined ? null : decodeQueryValue(group.label),
      message: group.message === undefined ? null : decodeQueryValue(group.message),
    });
  }
  return payments;
}

export const DEMO_PAY_TO =
  "ztestsapling1qv2z2dj8tp5h4zuu4klvlc83qgfjgd2x2a58nz5m4j7uahlsqyfzxdz92enh3zv64w7v6mc0v32";

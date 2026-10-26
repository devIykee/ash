import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { config } from "./config";

function encode(value: string): string {
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function decode(value: string): string {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  return atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
}

export function signSession(userId: string, secret = config().sessionSecret): string {
  const body = encode(JSON.stringify({ uid: userId, exp: Date.now() + 12 * 60 * 60 * 1000 }));
  const sig = bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(body)));
  return `${body}.${sig}`;
}

export function readSession(token: string, secret = config().sessionSecret): string | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(body)));
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const payload = JSON.parse(decode(body)) as { uid?: string; exp?: number };
    if (!payload.uid || !payload.exp || payload.exp < Date.now()) return null;
    return payload.uid;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `ash_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200${secure}`;
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `ash_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

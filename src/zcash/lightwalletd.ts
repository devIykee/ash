// Minimal lightwalletd client: gRPC over HTTP/2 with a tiny protobuf codec, no dependencies.
// Messages follow lightwalletd's service.proto and compact_formats.proto.
import http2 from "node:http2";
import type { Network } from "@/domain/types";

export const DEFAULT_LIGHTWALLETD: Record<Network, string> = {
  testnet: "https://testnet.zec.rocks:443",
  mainnet: "https://zec.rocks:443",
};

// Protobuf encoding of the few message shapes we send.
function varint(value: bigint | number): number[] {
  let v = BigInt(value);
  const out: number[] = [];
  while (v >= 0x80n) {
    out.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  out.push(Number(v));
  return out;
}

function fieldVarint(field: number, value: bigint | number): number[] {
  return [...varint((field << 3) | 0), ...varint(value)];
}

function fieldBytes(field: number, bytes: Uint8Array | number[]): number[] {
  return [...varint((field << 3) | 2), ...varint(bytes.length), ...bytes];
}

type Fields = Map<number, (bigint | Uint8Array)[]>;

/** Decodes one protobuf message into field number -> values (varints as bigint, bytes as Uint8Array). */
export function decodeMessage(bytes: Uint8Array): Fields {
  const fields: Fields = new Map();
  let offset = 0;
  const readVarint = (): bigint => {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      const byte = bytes[offset];
      if (byte === undefined) throw new Error("Truncated protobuf.");
      offset += 1;
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7n;
    }
  };
  while (offset < bytes.length) {
    const key = Number(readVarint());
    const field = key >> 3;
    const wire = key & 7;
    let value: bigint | Uint8Array;
    if (wire === 0) value = readVarint();
    else if (wire === 2) {
      const length = Number(readVarint());
      value = bytes.slice(offset, offset + length);
      offset += length;
    } else if (wire === 1) {
      value = bytes.slice(offset, offset + 8);
      offset += 8;
    } else if (wire === 5) {
      value = bytes.slice(offset, offset + 4);
      offset += 4;
    } else throw new Error(`Unsupported protobuf wire type ${wire}.`);
    const list = fields.get(field) ?? [];
    list.push(value);
    fields.set(field, list);
  }
  return fields;
}

const num = (fields: Fields, field: number): bigint => (fields.get(field)?.[0] as bigint | undefined) ?? 0n;
const bin = (fields: Fields, field: number): Uint8Array => (fields.get(field)?.[0] as Uint8Array | undefined) ?? new Uint8Array();
const list = (fields: Fields, field: number): Uint8Array[] => (fields.get(field) ?? []) as Uint8Array[];

export class LightwalletdError extends Error {}

// One HTTP/2 connection per server, reused across calls and closed after a quiet minute.
const sessions = new Map<string, http2.ClientHttp2Session>();

function session(origin: string): http2.ClientHttp2Session {
  const existing = sessions.get(origin);
  if (existing && !existing.closed && !existing.destroyed) return existing;
  const created = http2.connect(origin);
  created.setTimeout(60_000, () => created.close());
  created.on("error", () => sessions.delete(origin));
  created.on("close", () => sessions.delete(origin));
  created.on("goaway", () => sessions.delete(origin));
  created.unref();
  sessions.set(origin, created);
  return created;
}

/** Performs one gRPC call, retrying once on a dropped connection. */
async function call(url: string, method: string, body: number[], timeoutMs = 20_000): Promise<Uint8Array[]> {
  try {
    return await callOnce(url, method, body, timeoutMs);
  } catch (error) {
    if (error instanceof LightwalletdError && /status [1-9]|NotFound|not found/i.test(error.message)) throw error;
    sessions.delete(new URL(url).origin);
    return callOnce(url, method, body, timeoutMs);
  }
}

/** Performs one gRPC call and returns every response message (one for unary calls). */
async function callOnce(url: string, method: string, body: number[], timeoutMs: number): Promise<Uint8Array[]> {
  const origin = new URL(url);
  return new Promise((resolve, reject) => {
    let conn: http2.ClientHttp2Session;
    try {
      conn = session(origin.origin);
    } catch (error) {
      reject(new LightwalletdError(`Could not reach lightwalletd: ${error instanceof Error ? error.message : "connection failed"}`));
      return;
    }
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new LightwalletdError(message));
    };
    const timer = setTimeout(() => {
      stream.close(http2.constants.NGHTTP2_CANCEL);
      fail(`lightwalletd ${method} timed out.`);
    }, timeoutMs);
    const frame = Buffer.alloc(5 + body.length);
    frame.writeUInt8(0, 0);
    frame.writeUInt32BE(body.length, 1);
    Buffer.from(body).copy(frame, 5);
    const stream = conn.request({
      ":method": "POST",
      ":path": `/cash.z.wallet.sdk.rpc.CompactTxStreamer/${method}`,
      "content-type": "application/grpc",
      te: "trailers",
    });
    const chunks: Buffer[] = [];
    let status: string | undefined;
    let message = "";
    stream.on("response", (headers) => {
      if (headers["grpc-status"] !== undefined) {
        status = String(headers["grpc-status"]);
        message = String(headers["grpc-message"] ?? "");
      }
    });
    stream.on("trailers", (trailers) => {
      status = String(trailers["grpc-status"] ?? status ?? "0");
      message = decodeURIComponent(String(trailers["grpc-message"] ?? message ?? ""));
    });
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("error", (error) => fail(`lightwalletd ${method} failed: ${error.message}`));
    stream.on("end", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (status && status !== "0") {
        reject(new LightwalletdError(message || `lightwalletd ${method} returned status ${status}.`));
        return;
      }
      const data = Buffer.concat(chunks);
      const messages: Uint8Array[] = [];
      let offset = 0;
      while (offset + 5 <= data.length) {
        const length = data.readUInt32BE(offset + 1);
        messages.push(new Uint8Array(data.subarray(offset + 5, offset + 5 + length)));
        offset += 5 + length;
      }
      resolve(messages);
    });
    stream.end(frame);
  });
}

export type LightdInfo = { chainName: string; blockHeight: number; vendor: string };

export async function getLightdInfo(url: string): Promise<LightdInfo> {
  const [msg] = await call(url, "GetLightdInfo", []);
  const f = decodeMessage(msg ?? new Uint8Array());
  return {
    vendor: new TextDecoder().decode(bin(f, 2)),
    chainName: new TextDecoder().decode(bin(f, 4)),
    blockHeight: Number(num(f, 7)),
  };
}

export async function getLatestHeight(url: string): Promise<number> {
  const [msg] = await call(url, "GetLatestBlock", []);
  return Number(num(decodeMessage(msg ?? new Uint8Array()), 1));
}

export type RawTx = { data: Uint8Array; height: number | null };

/** Fetches a raw transaction. Height is null while the transaction is only in the mempool. */
export async function getTransaction(url: string, txidBytes: Uint8Array): Promise<RawTx> {
  const [msg] = await call(url, "GetTransaction", fieldBytes(3, txidBytes));
  const f = decodeMessage(msg ?? new Uint8Array());
  const data = bin(f, 1);
  if (data.length === 0) throw new LightwalletdError("The transaction was not found.");
  const height = num(f, 2);
  // Unmined transactions report height 0, or 2^64 - 1 on some servers.
  return { data, height: height === 0n || height >= 0xffffffffn ? null : Number(height) };
}

export type CompactOutput = { cmu: Uint8Array; epk: Uint8Array; ciphertext: Uint8Array };
export type CompactTx = { txidBytes: Uint8Array; outputs: CompactOutput[] };
export type CompactBlock = { height: number; txs: CompactTx[] };

/** Streams compact blocks for an inclusive height range. */
export async function getBlockRange(url: string, start: number, end: number): Promise<CompactBlock[]> {
  const blockId = (height: number) => fieldVarint(1, height);
  const body = [...fieldBytes(1, blockId(start)), ...fieldBytes(2, blockId(end))];
  const messages = await call(url, "GetBlockRange", body, 45_000);
  return messages.map((msg) => {
    const f = decodeMessage(msg);
    return {
      height: Number(num(f, 2)),
      txs: list(f, 7).map((txBytes) => {
        const tx = decodeMessage(txBytes);
        return {
          txidBytes: bin(tx, 2),
          outputs: list(tx, 5).map((outBytes) => {
            const o = decodeMessage(outBytes);
            return { cmu: bin(o, 1), epk: bin(o, 2), ciphertext: bin(o, 3) };
          }),
        };
      }),
    };
  });
}

import { AshError } from "@/domain/errors";

export type ChainObservation = {
  status: "observed" | "unresolved";
  confirmations: number | null;
  reason: string;
};

const TX_RE = /^[0-9a-fA-F]{64}$/;

export function assertTxId(txId: string): string {
  if (!TX_RE.test(txId)) throw new AshError("invalid_txid", "A Zcash transaction id is 64 hexadecimal characters.");
  return txId.toLowerCase();
}

export async function observeTransaction(input: {
  txId: string;
  rpcUrl: string;
  rpcUser?: string;
  rpcPassword?: string;
  fetchImpl?: typeof fetch;
}): Promise<ChainObservation> {
  const txId = assertTxId(input.txId);
  if (!input.rpcUrl) {
    return {
      status: "unresolved",
      confirmations: null,
      reason: "No Zcash RPC URL is configured, so ASH cannot observe this transaction.",
    };
  }
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (input.rpcUser) {
    headers.authorization = `Basic ${btoa(`${input.rpcUser}:${input.rpcPassword ?? ""}`)}`;
  }
  const fetcher = input.fetchImpl ?? fetch;
  try {
    const response = await fetcher(input.rpcUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "1.0",
        id: "ash",
        method: "getrawtransaction",
        params: [txId, 1],
      }),
    });
    if (!response.ok) {
      return { status: "unresolved", confirmations: null, reason: `RPC responded ${response.status}.` };
    }
    const body = (await response.json()) as {
      result?: { confirmations?: number };
      error?: { message?: string } | null;
    };
    if (body.error || !body.result) {
      return {
        status: "unresolved",
        confirmations: null,
        reason: body.error?.message || "The node did not return this transaction.",
      };
    }
    const confirmations = Number(body.result.confirmations ?? 0);
    return {
      status: "observed",
      confirmations: Number.isFinite(confirmations) ? confirmations : 0,
      reason: "The node returned the transaction. Shielded amount and recipient are not visible from this call.",
    };
  } catch {
    return { status: "unresolved", confirmations: null, reason: "The Zcash RPC request failed." };
  }
}

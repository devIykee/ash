const TX_RE = /^[0-9a-fA-F]{64}$/;

/** A Zcash transaction id is 64 hexadecimal characters. */
export function validTxId(value: string): boolean {
  return TX_RE.test(value.trim());
}

import { readFileSync } from "node:fs";
import path from "node:path";
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import {
  addressFromIvk,
  addressMatchesIvk,
  decryptIncoming,
  encryptNote,
  keysFromSpendingKey,
  leToBigint,
  memoText,
  noteCommitment,
  recoverOutgoing,
  saplingGenerators,
  toScalar,
  prfExpand,
  diversifyHash,
  findGroupHash,
} from "@/zcash/sapling";

// Official vectors from github.com/zcash/zcash-test-vectors, copied into tests/vectors.
function vectors(name: string): Record<string, unknown>[] {
  // Keep large integers exact: JSON.parse would round values above 2^53.
  const text = readFileSync(path.join(__dirname, "vectors", `${name}.json`), "utf8").replace(/([\[,]\s*)(\d{16,})(?=\s*[,\]])/g, '$1"$2"');
  const rows = JSON.parse(text) as unknown[][];
  const fields = (rows[1][0] as string).split(", ");
  return rows.slice(2).map((row) => Object.fromEntries(fields.map((field, index) => [field, row[index]])));
}

const hx = (value: unknown) => hexToBytes(value as string);

describe("Sapling against zcash-test-vectors", () => {
  it("derives the fixed generators", () => {
    const [v] = vectors("sapling_generators");
    const g = saplingGenerators();
    expect(bytesToHex(g.spendAuth.toBytes())).toBe(v.skb);
    expect(bytesToHex(g.proofGen.toBytes())).toBe(v.pkb);
    expect(bytesToHex(g.pedersenR.toBytes())).toBe(v.wprb);
    expect(bytesToHex(g.pedersen[0].toBytes())).toBe(v.pb0);
    expect(bytesToHex(g.pedersen[3].toBytes())).toBe(v.pb3);
    const text = (value: string) => new TextEncoder().encode(value);
    expect(bytesToHex(findGroupHash(new Uint8Array(), text("Zcash_G_")).toBytes())).toBe(v.skb);
    expect(bytesToHex(findGroupHash(new Uint8Array(), text("Zcash_H_")).toBytes())).toBe(v.pkb);
    expect(bytesToHex(findGroupHash(text("r"), text("Zcash_PH")).toBytes())).toBe(v.wprb);
  });

  it("derives keys, addresses, and note commitments", () => {
    for (const v of vectors("sapling_key_components")) {
      const keys = keysFromSpendingKey(hx(v.sk));
      expect(bytesToHex(keys.ak)).toBe(v.ak);
      expect(bytesToHex(keys.nk)).toBe(v.nk);
      expect(bytesToHex(keys.ovk)).toBe(v.ovk);
      expect(keys.ivk).toBe(leToBigint(hx(v.ivk)));
      const address = addressFromIvk(keys.ivk, hx(v.default_d));
      expect(address && bytesToHex(address.pkd)).toBe(v.default_pk_d);
      expect(addressMatchesIvk(address!, keys.ivk)).toBe(true);
      const gd = diversifyHash(hx(v.default_d))!;
      const cmu = noteCommitment(gd.toBytes(), hx(v.default_pk_d), BigInt(v.note_v as string | number), leToBigint(hx(v.note_r)));
      expect(bytesToHex(cmu)).toBe(v.note_cmu);
    }
  });

  it("decrypts official (pre-Canopy) note ciphertexts with ivk and ovk", () => {
    for (const v of vectors("sapling_note_encryption")) {
      const output = { cv: hx(v.cv), cmu: hx(v.cmu), epk: hx(v.epk), encCiphertext: hx(v.c_enc), outCiphertext: hx(v.c_out) };
      const ivk = leToBigint(hx(v.ivk));
      // The chain rejects lead byte 0x01 now, so the default refuses it.
      expect(decryptIncoming(output, ivk)).toBeNull();
      const legacy = { allowLegacy: true };
      const incoming = decryptIncoming(output, ivk, legacy);
      expect(incoming?.value).toBe(BigInt(v.v as number));
      expect(bytesToHex(incoming!.address.d)).toBe(v.default_d);
      expect(bytesToHex(incoming!.memo!)).toBe(v.memo);
      const compact = decryptIncoming({ ...output, encCiphertext: output.encCiphertext.slice(0, 52) }, ivk, legacy);
      expect(compact?.value).toBe(BigInt(v.v as number));
      const outgoing = recoverOutgoing(output, hx(v.ovk), legacy);
      expect(outgoing?.value).toBe(BigInt(v.v as number));
      expect(bytesToHex(outgoing!.address.pkd)).toBe(v.default_pk_d);
      // A different key sees nothing.
      expect(decryptIncoming(output, ivk ^ 1n, legacy)).toBeNull();
    }
  });

  it("rejects a ciphertext whose amount does not match the commitment", () => {
    const keys = keysFromSpendingKey(randomBytes(32));
    let d = randomBytes(11);
    while (!diversifyHash(d)) d = randomBytes(11);
    const address = addressFromIvk(keys.ivk, d)!;
    const real = encryptNote({ address, value: 1_000n, rseed: randomBytes(32), memo: new TextEncoder().encode("ASH ref"), ovk: keys.ovk });
    const decoded = decryptIncoming(real, keys.ivk);
    expect(decoded?.value).toBe(1_000n);
    expect(memoText(decoded!.memo)).toBe("ASH ref");
    expect(recoverOutgoing(real, keys.ovk)?.value).toBe(1_000n);
    // A sender who claims a larger amount inside the ciphertext but commits to the real one is caught.
    const forged = encryptNote({ address, value: 9_000_000n, rseed: randomBytes(32), memo: new Uint8Array() });
    expect(decryptIncoming({ ...forged, cmu: real.cmu }, keys.ivk)).toBeNull();
    expect(toScalar(prfExpand(randomBytes(32), new Uint8Array([4])))).toBeLessThan(2n ** 252n);
  });
});

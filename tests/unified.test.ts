import { readFileSync } from "node:fs";
import path from "node:path";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { leToBigint } from "@/zcash/sapling";
import { decodeUnified, f4jumble, f4jumbleInverse, parseViewingKey, saplingReceiver } from "@/zcash/unified";

function vectors(name: string): Record<string, unknown>[] {
  const rows = JSON.parse(readFileSync(path.join(__dirname, "vectors", `${name}.json`), "utf8")) as unknown[][];
  const fields = (rows[1][0] as string).split(", ");
  return rows.slice(2).map((row) => Object.fromEntries(fields.map((field, index) => [field, row[index]])));
}

describe("ZIP 316 against zcash-test-vectors", () => {
  it("F4Jumble round-trips the official vectors", () => {
    for (const v of vectors("f4jumble")) {
      const normal = hexToBytes(v.normal as string);
      expect(bytesToHex(f4jumble(normal))).toBe(v.jumbled);
      expect(bytesToHex(f4jumbleInverse(hexToBytes(v.jumbled as string)))).toBe(v.normal);
    }
  });

  it("finds the Sapling receiver in unified addresses", () => {
    for (const v of vectors("unified_address")) {
      const report = saplingReceiver(v.unified_addr as string);
      if (v.sapling_raw_addr) {
        expect(report.sapling && bytesToHex(new Uint8Array([...report.sapling.d, ...report.sapling.pkd]))).toBe(v.sapling_raw_addr);
        expect(report.saplingEncoded?.startsWith("zs1")).toBe(true);
      } else {
        expect(report.sapling).toBeNull();
      }
      expect(report.hasOrchard).toBe(Boolean(v.orchard_raw_addr));
    }
  });

  it("reads the Sapling part of unified full and incoming viewing keys", () => {
    for (const v of vectors("unified_full_viewing_keys")) {
      const decoded = decodeUnified(v.unified_fvk as string);
      expect(decoded.kind).toBe("fvk");
      if (v.sapling_fvk_bytes) {
        const key = parseViewingKey(v.unified_fvk as string);
        expect(bytesToHex(key.ovk!)).toBe((v.sapling_fvk_bytes as string).slice(128, 192));
      } else {
        expect(() => parseViewingKey(v.unified_fvk as string)).toThrow(/no Sapling part/);
      }
    }
    for (const v of vectors("unified_incoming_viewing_keys")) {
      if (!v.sapling_ivk_bytes) continue;
      const key = parseViewingKey(v.unified_ivk as string);
      expect(key.ivk).toBe(leToBigint(hexToBytes((v.sapling_ivk_bytes as string).slice(64))));
      expect(key.ovk).toBeNull();
    }
  });

  it("refuses spending keys and addresses in the key field", () => {
    expect(() => parseViewingKey("secret-extended-key-main1qqqqqq")).toThrow(/spending key/);
    const [first] = vectors("unified_address");
    expect(() => parseViewingKey(first.unified_addr as string)).toThrow(/address/);
  });
});

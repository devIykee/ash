import { readFileSync } from "node:fs";
import path from "node:path";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { mnemonicToSeedSync } from "@scure/bip39";
import { describe, expect, it } from "vitest";
import { leToBigint } from "@/zcash/sapling";
import { parseViewingKey } from "@/zcash/unified";
import { defaultAddress, deriveHardened, diversifier, encodeExtendedFvk, extendedFvkBytes, fullViewingParts, master, saplingAccount } from "@/zcash/zip32";

function vectors(name: string): Record<string, unknown>[] {
  const rows = JSON.parse(readFileSync(path.join(__dirname, "vectors", `${name}.json`), "utf8")) as unknown[][];
  const fields = (rows[1][0] as string).split(", ");
  return rows.slice(2).map((row) => Object.fromEntries(fields.map((field, index) => [field, row[index]])));
}

const seed = Uint8Array.from({ length: 32 }, (_, i) => i);

describe("ZIP 32 against zcash-test-vectors", () => {
  it("derives the master key and hardened children", () => {
    const rows = vectors("sapling_zip32_hard");
    let key = master(seed);
    for (const [index, v] of rows.entries()) {
      if (index > 0) key = deriveHardened(key, index);
      const parts = fullViewingParts(key);
      expect(bytesToHex(parts.ak)).toBe(v.ak);
      expect(bytesToHex(parts.nk)).toBe(v.nk);
      expect(bytesToHex(key.ovk)).toBe(v.ovk);
      expect(bytesToHex(key.dk)).toBe(v.dk);
      expect(bytesToHex(key.chainCode)).toBe(v.c);
      expect(parts.ivk).toBe(leToBigint(hexToBytes(v.ivk as string)));
      expect(bytesToHex(extendedFvkBytes(key))).toBe(v.xfvk);
    }
  });

  it("computes FF1-AES256 diversifiers", () => {
    for (const v of [...vectors("sapling_zip32"), ...vectors("sapling_zip32_hard")]) {
      const dk = hexToBytes(v.dk as string);
      for (const [field, index] of [["d0", 0n], ["d1", 1n], ["d2", 2n], ["dmax", (1n << 88n) - 1n]] as const) {
        const got = diversifier(dk, index);
        expect(got ? bytesToHex(got) : null).toBe(v[field] ?? null);
      }
    }
  });

  it("derives the account wallets use from a seed (m/32'/133'/account')", () => {
    for (const v of vectors("unified_full_viewing_keys")) {
      if (!v.sapling_fvk_bytes) continue;
      const account = saplingAccount(hexToBytes(v.root_seed as string), "mainnet", v.account as number);
      const { ak, nk, ovk, dk } = fullViewingParts(account);
      expect(bytesToHex(new Uint8Array([...ak, ...nk, ...ovk, ...dk]))).toBe(v.sapling_fvk_bytes);
    }
  });

  it("produces a default address and a viewing key ASH accepts", () => {
    const phraseSeed = mnemonicToSeedSync("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about");
    for (const network of ["testnet", "mainnet"] as const) {
      const account = saplingAccount(phraseSeed, network);
      const { address } = defaultAddress(account);
      const parsed = parseViewingKey(encodeExtendedFvk(account, network));
      expect(parsed.network).toBe(network);
      expect(parsed.ivk).toBe(fullViewingParts(account).ivk);
      expect(address.d.length).toBe(11);
    }
  });
});

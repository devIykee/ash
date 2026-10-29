// Creates a Zcash wallet in the browser. The recovery phrase never leaves this function's
// caller: only the address and viewing key are sent to ASH. The phrase restores in Zashi,
// YWallet, or any wallet that follows BIP 39 and ZIP 32.
import { generateMnemonic, mnemonicToSeed, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import type { Network } from "@/domain/types";
import { encodeSaplingAddress } from "./unified";
import { defaultAddress, encodeExtendedFvk, saplingAccount } from "./zip32";

export type CreatedWallet = { phrase: string; address: string; viewingKey: string; network: Network };

export async function createWallet(network: Network): Promise<CreatedWallet> {
  const phrase = generateMnemonic(wordlist, 256);
  return walletFromPhrase(phrase, network);
}

export async function walletFromPhrase(phrase: string, network: Network): Promise<CreatedWallet> {
  const normalized = phrase.trim().toLowerCase().split(/\s+/).join(" ");
  if (!validateMnemonic(normalized, wordlist)) throw new Error("That recovery phrase is not valid.");
  const seed = await mnemonicToSeed(normalized);
  const account = saplingAccount(seed, network, 0);
  seed.fill(0);
  const { address } = defaultAddress(account);
  return { phrase: normalized, address: encodeSaplingAddress(address, network), viewingKey: encodeExtendedFvk(account, network), network };
}

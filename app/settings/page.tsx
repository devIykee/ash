import { ConsequenceList, PageHeader } from "@/components/page-header";
import { WalletKeyCard } from "@/components/wallet-keys-form";
import { requireActor } from "@/server/current";
import { pageRead } from "@/server/page-data";
import { allowedModes } from "@/server/mode";
import { listWalletKeys } from "@/services/wallet-keys";

export const metadata = { title: "Receiving keys" };

export default async function SettingsPage() {
  const actor = await requireActor();
  const keys = await pageRead((tx) => listWalletKeys(tx, actor));
  const modes = allowedModes();
  const networks = (["testnet", "mainnet"] as const).filter((network) => modes.includes(network));
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Settings"
        title="Receiving keys"
        lede="To take real payments, add the address you want to be paid at and a viewing key for it. ASH uses the key only to confirm that a payment arrived: the amount, the recipient, and the memo reference."
      />
      <ConsequenceList
        items={[
          { title: "What ASH can see", body: "Payments into this wallet account. Use a separate account for ASH if you want to keep other payments out of view." },
          { title: "What ASH cannot do", body: "Spend. A viewing key cannot move money. Your wallet signs every payment." },
          { title: "How it is stored", body: "Encrypted on the server and never shown again. Remove it any time." },
        ]}
      />
      {networks.map((network) => (
        <WalletKeyCard key={network} network={network} current={keys.find((key) => key.network === network) ?? null} operator={actor.user.role === "operator"} />
      ))}
      <details className="notes quiet-notes">
        <summary>Where to find your viewing key</summary>
        <ul>
          <li>Most wallets show it under backup, export, or advanced settings, as a viewing key or unified full viewing key.</li>
          <li>It starts with uview (full), uivk (incoming), or zxview (Sapling). Testnet keys have test in the prefix.</li>
          <li>Copy the receiving address from the same account. A unified address works if it includes a Sapling receiver.</li>
          <li>Never paste a seed phrase or a spending key anywhere online. ASH refuses them.</li>
        </ul>
      </details>
    </div>
  );
}

import { HelpCenter } from "@/components/help-center";
import { PageHeader } from "@/components/page-header";
import { networkLabel } from "@/components/runtime";
import { pageRuntime } from "@/server/runtime";

export const metadata = { title: "Help" };

export default async function HelpPage() {
  const env = (await pageRuntime());
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Help"
        title="Find the next step"
        lede="Search the guides, the words on the screen, and what to do when a payment or delivery does not finish."
      />
      <section className="panel stack" id="network">
        <h2>
          This site: {networkLabel(env)}, {env.practice ? "practice payments" : "wallet payments"}
        </h2>
        {env.practice ? (
          <p>
            Payments here are practice records. ASH marks them as checked so you can follow a task to the end, but nothing is sent on the Zcash network
            and no money moves.
          </p>
        ) : (
          <p>
            You pay from your own wallet. Each payment screen gives you a wallet link and the receiving address. After sending, paste the transaction id.
            ASH asks a Zcash node whether that transaction exists. A shielded transaction hides its amount and recipient, so ASH records it as seen, not
            as proof of payment. Files and receipts stay locked until a payment is accepted.
          </p>
        )}
        <p className="muted">
          {env.network === "mainnet"
            ? "Addresses must be Zcash mainnet shielded addresses, starting with zs1 or u1."
            : "Addresses must be Zcash testnet shielded addresses, starting with ztestsapling1 or utest1. Testnet coins have no value."}{" "}
          ASH never holds a spending key, seed phrase, or viewing key.
        </p>
      </section>
      <HelpCenter />
    </div>
  );
}

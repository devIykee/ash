import { ArrowRight, HandCoins } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TipPay } from "@/components/tip-desk";
import { AshError } from "@/domain/errors";
import { zatoshiToZec } from "@/domain/money";
import { getTip } from "@/services/tips";
import { config } from "@/server/config";
import { getStore } from "@/server/store";

export const metadata = { title: "Tip" };

export default async function TipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const tip = await getStore().read((tx) => getTip(tx, id));
    const practice = config().allowSimulated;
    return (
      <div className="stack public-page">
        <header className="public-head">
          <span className="public-icon" aria-hidden="true">
            <HandCoins size={26} />
          </span>
          <p className="kicker">{tip.network === "testnet" ? "Tip page · Zcash testnet" : "Tip page · Zcash mainnet"}</p>
          <h1>{tip.title}</h1>
          {tip.statement ? <p className="lede">{tip.statement}</p> : null}
        </header>
        <section className="panel stack public-card">
          <TipPay id={id} address={tip.address} suggested={tip.suggestedZatoshi.map((amount) => zatoshiToZec(BigInt(amount)))} uri={tip.uri} practice={practice} />
        </section>
        <section className="panel stack">
          <p className="kicker">Tips go to</p>
          <p className="mono address-line">{tip.address}</p>
          {practice ? (
            <p>
              <a href={tip.uri}>Open a wallet request for {tip.amountZec} ZEC</a>
              <span className="muted"> · Opening it does not pay.</span>
            </p>
          ) : null}
        </section>
        <details className="notes quiet-notes">
          <summary>What a receipt here proves</summary>
          <ul>
            {tip.disclosures.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
        <Link className="link-arrow" href="/payments/tips">All tip pages <ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
    );
  } catch (error) {
    if (error instanceof AshError && error.status === 404) notFound();
    throw error;
  }
}

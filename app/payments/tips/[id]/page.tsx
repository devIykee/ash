import Link from "next/link";
import { notFound } from "next/navigation";
import { TipPay } from "@/components/tip-desk";
import { PageHeader } from "@/components/page-header";
import { AshError } from "@/domain/errors";
import { zatoshiToZec } from "@/domain/money";
import { getTip } from "@/services/tips";
import { config } from "@/server/config";
import { getStore } from "@/server/store";

export const metadata = { title: "Tip" };

export default async function TipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const tip = await getStore().transaction((tx) => getTip(tx, id));
    const practice = config().allowSimulated;
    return (
      <div className="stack">
        <PageHeader eyebrow={tip.network === "testnet" ? "Zcash testnet" : "Zcash mainnet"} title={tip.title} lede={tip.statement} />
        <p className="mono">{tip.address}</p>
        <p>
          <a href={tip.uri}>Open a wallet request for {tip.amountZec} ZEC</a>
        </p>
        <p className="muted">Opening the wallet request does not pay, and ASH has not seen a transaction yet.</p>
        {tip.disclosures.map((item) => (
          <p className="banner" key={item}>
            {item}
          </p>
        ))}
        <TipPay id={id} address={tip.address} suggested={tip.suggestedZatoshi.map((amount) => zatoshiToZec(BigInt(amount)))} practice={practice} />
        <Link href="/payments/tips">All tip pages</Link>
      </div>
    );
  } catch (error) {
    if (error instanceof AshError && error.status === 404) notFound();
    throw error;
  }
}

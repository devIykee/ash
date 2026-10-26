import Link from "next/link";
import { notFound } from "next/navigation";
import { TipPay } from "@/components/tip-desk";
import { AshError } from "@/domain/errors";
import { zatoshiToZec } from "@/domain/money";
import { getTip } from "@/services/tips";
import { getStore } from "@/server/store";

export default async function TipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const tip = await getStore().transaction((tx) => getTip(tx, id));
    return (
      <div className="stack">
        <p className="kicker">{tip.network}</p>
        <h1>{tip.title}</h1>
        <p>{tip.statement}</p>
        <p className="mono">{tip.address}</p>
        <p>
          <a href={tip.uri}>Open ZIP-321 request for {tip.amountZec} ZEC</a>
        </p>
        {tip.disclosures.map((item) => (
          <p className="banner" key={item}>
            {item}
          </p>
        ))}
        <TipPay id={id} suggested={tip.suggestedZatoshi.map((amount) => zatoshiToZec(BigInt(amount)))} />
        <Link href="/payments/tips">All tip pages</Link>
      </div>
    );
  } catch (error) {
    if (error instanceof AshError && error.status === 404) notFound();
    throw error;
  }
}

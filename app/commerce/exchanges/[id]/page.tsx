import Link from "next/link";
import { notFound } from "next/navigation";
import { ExchangeDesk } from "@/components/exchange-desk";
import { AshError } from "@/domain/errors";
import { DISCLOSURES } from "@/domain/types";
import { getExchange } from "@/services/exchange";
import { operationDetail } from "@/services/overview";
import { requireActor } from "@/server/current";
import { getStore } from "@/server/store";

export default async function ExchangePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  try {
    const [detail, exchange] = await getStore().transaction(async (tx) => {
      const loaded = await getExchange(tx, actor, id);
      const operation = await operationDetail(tx, actor, id);
      return [operation, loaded] as const;
    });
    if (!detail || detail === "forbidden") notFound();
    const role = actor.user.id === exchange.exchange.sellerId ? "seller" : actor.user.id === exchange.exchange.buyerId ? "buyer" : "other";
    return (
      <div className="stack">
        <p className="kicker">Data exchange</p>
        <h1>{detail.operation.label}</h1>
        <span className="pill" data-state={detail.operation.state}>
          {detail.operation.state.replaceAll("_", " ")}
        </span>
        <p className="banner">{DISCLOSURES.escrow}</p>
        {detail.operation.payment ? (
          <p className="mono">
            Payment {detail.operation.payment.status} · {detail.operation.payment.mode}
          </p>
        ) : (
          <p className="muted">No payment recorded.</p>
        )}
        <ExchangeDesk
          id={id}
          version={exchange.version}
          state={detail.operation.state}
          role={role}
          offerId={exchange.exchange.offerId}
          priceZatoshi={exchange.exchange.priceZatoshi}
          buyerPublicKey={exchange.exchange.buyerPublicKey}
          releaseReady={exchange.exchange.releaseReady}
        />
        <Link href={`/operations/${id}`}>Operation record</Link>
      </div>
    );
  } catch (error) {
    if (error instanceof AshError && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  }
}

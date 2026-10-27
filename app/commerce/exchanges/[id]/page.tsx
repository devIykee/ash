import Link from "next/link";
import { notFound } from "next/navigation";
import { ExchangeDesk } from "@/components/exchange-desk";
import { GuideStart } from "@/components/guide-provider";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { AshError } from "@/domain/errors";
import { DISCLOSURES } from "@/domain/types";
import { paymentModeLabel, stateLabel } from "@/components/labels";
import { getExchange } from "@/services/exchange";
import { operationDetail } from "@/services/overview";
import { config } from "@/server/config";
import { requireActor } from "@/server/current";
import { getStore } from "@/server/store";

export const metadata = { title: "Exchange" };

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
    const payment = detail.operation.payment;
    return (
      <div className="stack">
        <PageHeader
          eyebrow="File exchange"
          title={detail.operation.label}
          lede="The sender allows delivery, then the buyer pays. Opening the file happens in this browser."
          actions={<GuideStart id="delivery">If delivery fails</GuideStart>}
        />
        <StatusPill value={detail.operation.state} />
        <p className="banner">{DISCLOSURES.escrow}</p>
        {payment ? (
          <p>
            Payment: {stateLabel(payment.status)}. {paymentModeLabel(payment.mode)}
          </p>
        ) : (
          <p className="muted">No payment has been recorded.</p>
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
          practice={config().allowSimulated}
        />
        <Link href={`/operations/${id}`}>Open the activity record</Link>
      </div>
    );
  } catch (error) {
    if (error instanceof AshError && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  }
}

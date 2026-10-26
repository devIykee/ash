import Link from "next/link";
import { zatoshiToZec } from "@/domain/money";
import { listOffers } from "@/services/exchange";
import { listOperations } from "@/services/overview";
import { currentActor } from "@/server/current";
import { getStore } from "@/server/store";

export default async function CommercePage() {
  const actor = await currentActor();
  const offers = await getStore().transaction((tx) => listOffers(tx));
  const exchanges = actor
    ? (await getStore().transaction((tx) => listOperations(tx, actor))).filter((item) => item.type === "data_exchange")
    : [];
  return (
    <div className="stack">
      <p className="kicker">Commerce</p>
      <h1>Encrypted exchange</h1>
      <p className="lede">Sellers encrypt before upload. Buyers decrypt after ASH accepts a payment. This is a labeled Shamir delivery prototype, not an atomic swap.</p>
      <div className="row">
        <Link className="button" href="/commerce/new">
          Publish an offer
        </Link>
        <Link className="button quiet" href="/agents">
          Paid API
        </Link>
      </div>
      <div className="grid-2">
        {offers.length === 0 ? <p className="muted">No open offers.</p> : null}
        {offers.map((offer) => (
          <Link className="card" key={offer.id} href={`/commerce/offers/${offer.id}`}>
            <p className="kicker">{offer.sellerName}</p>
            <h3>{offer.title}</h3>
            <p>{offer.description}</p>
            <p className="mono">{zatoshiToZec(BigInt(offer.priceZatoshi))} ZEC</p>
          </Link>
        ))}
      </div>
      <section className="stack">
        <h2>Your exchanges</h2>
        {exchanges.length === 0 ? <p className="muted">None yet.</p> : null}
        {exchanges.map((item) => (
          <Link className="card" key={item.id} href={`/commerce/exchanges/${item.id}`}>
            <h3>{item.label}</h3>
            <span className="pill" data-state={item.state}>
              {item.state.replaceAll("_", " ")}
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}

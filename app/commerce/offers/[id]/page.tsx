import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyButton } from "@/components/buy-button";
import { zatoshiToZec } from "@/domain/money";
import { AshError } from "@/domain/errors";
import { getOffer } from "@/services/exchange";
import { currentActor } from "@/server/current";
import { getStore } from "@/server/store";

export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();
  try {
    const offer = await getStore().transaction((tx) => getOffer(tx, id, actor));
    return (
      <div className="stack">
        <p className="kicker">{offer.sellerName}</p>
        <h1>{offer.title}</h1>
        <p>{offer.description}</p>
        <p className="mono">
          {zatoshiToZec(BigInt(offer.priceZatoshi))} ZEC · {offer.byteLength} ciphertext bytes · {offer.network}
        </p>
        <p className="mono">Plaintext claim {offer.plaintextSha256}</p>
        <p className="mono">Ciphertext {offer.ciphertextSha256}</p>
        {offer.disclosures.map((item) => (
          <p className="banner" key={item}>
            {item}
          </p>
        ))}
        {"pack" in offer ? <p className="banner ok">You published this offer. The content key should still be in this browser.</p> : null}
        <BuyButton offerId={id} disabled={!actor} />
        {!actor ? <p className="muted">Sign in as Jules Okonkwo before starting a purchase.</p> : null}
        <Link href="/commerce">Back to commerce</Link>
      </div>
    );
  } catch (error) {
    if (error instanceof AshError && error.status === 404) notFound();
    throw error;
  }
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyButton } from "@/components/buy-button";
import { SavedFileKey } from "@/components/saved-file-key";
import { PageHeader } from "@/components/page-header";
import { zatoshiToZec } from "@/domain/money";
import { AshError } from "@/domain/errors";
import { getOffer } from "@/services/exchange";
import { currentActor } from "@/server/current";
import { getStore } from "@/server/store";

export const metadata = { title: "Offer" };

export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();
  try {
    const offer = await getStore().read((tx) => getOffer(tx, id, actor));
    const price = `${zatoshiToZec(BigInt(offer.priceZatoshi))} ZEC`;
    return (
      <div className="stack">
        <PageHeader eyebrow={offer.sellerName} title={offer.title} lede={offer.description} />
        <div data-guide="offer-terms" className="stack">
          <p>
            {price} · {offer.fileName ? `${offer.fileName} · ` : ""}
            {offer.byteLength} encrypted bytes · {offer.network === "testnet" ? "Zcash testnet" : "Zcash mainnet"}
          </p>
          {offer.payTo ? (
            <>
              <p className="muted">The seller receives payment at</p>
              <p className="mono address-line">{offer.payTo}</p>
            </>
          ) : null}
          <p className="muted">Fingerprint of the original file</p>
          <p className="mono address-line">{offer.plaintextSha256}</p>
          <p className="muted">Fingerprint of the encrypted copy</p>
          <p className="mono address-line">{offer.ciphertextSha256}</p>
        </div>
        {offer.disclosures.map((item) => (
          <p className="banner" key={item}>
            {item}
          </p>
        ))}
        {"pack" in offer ? <SavedFileKey offerId={id} /> : null}
        {"pack" in offer ? (
          <p className="muted">This is your offer. Buyers start a purchase from this page, then you allow delivery from the exchange.</p>
        ) : (
          <BuyButton offerId={id} disabled={!actor} title={offer.title} price={price} />
        )}
        {!actor ? <p className="muted">Sign in as Jules Okonkwo before starting a purchase. Starting a purchase does not pay.</p> : null}
        <Link href="/commerce">Back to offers</Link>
      </div>
    );
  } catch (error) {
    if (error instanceof AshError && error.status === 404) notFound();
    throw error;
  }
}

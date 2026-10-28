import { ArrowLeftRight, FileLock2, Plus } from "lucide-react";
import { recordLabel } from "@/components/labels";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { GuideStart } from "@/components/guide-provider";
import { ConsequenceList, PageHeader } from "@/components/page-header";
import { relativeTime } from "@/components/format";
import { RecordList } from "@/components/record-list";
import { zatoshiToZec } from "@/domain/money";
import { listOffers } from "@/services/exchange";
import { listOperations } from "@/services/overview";
import { currentActor } from "@/server/current";
import { getStore } from "@/server/store";

export const metadata = { title: "Exchange" };

export default async function CommercePage() {
  const actor = await currentActor();
  const { offers, exchanges } = await getStore().read(async (tx) => ({
    offers: await listOffers(tx),
    exchanges: actor ? (await listOperations(tx, actor)).filter((item) => item.type === "data_exchange") : [],
  }));
  const canPublish = actor?.user.role === "creator" || actor?.user.role === "operator";
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Exchange"
        title="Buy or sell a private file"
        lede="The file is encrypted in the sender’s browser before upload. The recipient opens it on their own device. This is not an escrow service, and a failed delivery does not refund the payment by itself."
        actions={
          <div className="row">
            {canPublish ? (
              <Link className="button" href="/commerce/new">
                <Plus size={16} aria-hidden="true" /> Publish a file
              </Link>
            ) : null}
            <GuideStart id="exchange">Guide an exchange</GuideStart>
          </div>
        }
      />
      <ConsequenceList
        items={[
          { title: "Before you pay", body: "Read the price, the description, and the file fingerprint." },
          { title: "What ASH stores", body: "The encrypted file and one part of the key. ASH cannot read the file." },
          { title: "If opening fails", body: "Report the failure, then try the stored key part. The payment is not reversed." },
        ]}
      />
      <div className="grid-2" data-guide="offer-list">
        {offers.length === 0 ? (
          <EmptyState
            icon={FileLock2}
            title="No files are offered yet"
            body={canPublish ? "Publish a file when you want to sell one. The original text stays in your browser until you encrypt it." : "A seller has not published a file. Sign in as Noor Hale to publish one, or check back for an offer."}
            action={
              canPublish ? (
                <Link className="button" href="/commerce/new">
                  Publish a file
                </Link>
              ) : null
            }
          />
        ) : (
          offers.map((offer) => (
            <Link className="card offer-card" key={offer.id} href={`/commerce/offers/${offer.id}`}>
              <div className="offer-top">
                <span className="tile-icon" aria-hidden="true">
                  <FileLock2 size={18} />
                </span>
                <span className="price-chip">{zatoshiToZec(BigInt(offer.priceZatoshi))} ZEC</span>
              </div>
              <h3>{offer.title}</h3>
              <p className="muted clamp-2">{offer.description}</p>
              <p className="faint" style={{ fontSize: "0.84rem" }}>
                {offer.sellerName}
                {offer.fileName ? ` · ${offer.fileName}` : ""}
              </p>
            </Link>
          ))
        )}
      </div>
      <section className="stack">
        <h2>Your exchanges</h2>
        <div data-guide="exchange-list" className="stack">
          {exchanges.length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title="No exchanges yet" body="Start a purchase from an offer, or publish a file and wait for a buyer. Payment happens only after the sender allows delivery." />
          ) : (
            <RecordList
              label="Your exchanges"
              rows={exchanges.map((item) => ({
                href: `/commerce/exchanges/${item.id}`,
                title: recordLabel(item.label),
                type: "data_exchange",
                sub: `Updated ${relativeTime(item.updatedAt)}`,
                state: item.state,
              }))}
            />
          )}
        </div>
      </section>
    </div>
  );
}

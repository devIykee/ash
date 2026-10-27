import { GuideStart } from "@/components/guide-provider";
import { OfferForm } from "@/components/offer-form";
import { ConsequenceList, PageHeader } from "@/components/page-header";
import { requireActor } from "@/server/current";

export const metadata = { title: "Publish a file" };

export default async function NewOfferPage() {
  const actor = await requireActor();
  const allowed = actor.user.role === "creator" || actor.user.role === "operator";
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Exchange"
        title="Publish a file"
        lede="You will review the price and the description, then encrypt the text in this browser. The original is not uploaded."
        actions={<GuideStart id="exchange">Guide this publish</GuideStart>}
      />
      <ConsequenceList
        items={[
          { title: "What you must keep", body: "The file key is shown once. This browser is not a backup." },
          { title: "What a buyer sees", body: "The title, description, price, and fingerprints. Not the original text." },
          { title: "What payment does", body: "Publishing does not collect money. The buyer pays after you allow delivery." },
        ]}
      />
      {allowed ? <OfferForm /> : <p className="banner">Sign in as Noor Hale or Avery Chen to publish. Buyers start from an existing offer.</p>}
    </div>
  );
}

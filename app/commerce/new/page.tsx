import { OfferForm } from "@/components/offer-form";
import { requireActor } from "@/server/current";

export default async function NewOfferPage() {
  const actor = await requireActor();
  const allowed = actor.user.role === "creator" || actor.user.role === "operator";
  return (
    <div className="stack">
      <p className="kicker">Commerce</p>
      <h1>Publish an offer</h1>
      {allowed ? (
        <OfferForm />
      ) : (
        <p className="banner">Sign in as Noor Hale or Avery Chen to publish. Buyers start from an existing offer.</p>
      )}
    </div>
  );
}

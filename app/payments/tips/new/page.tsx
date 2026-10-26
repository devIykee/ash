import { TipForm } from "@/components/tip-desk";
import { requireActor } from "@/server/current";

export default async function NewTipPage() {
  const actor = await requireActor();
  const allowed = actor.user.role === "creator" || actor.user.role === "operator";
  return (
    <div className="stack">
      <p className="kicker">Tips</p>
      <h1>New tip page</h1>
      {allowed ? <TipForm /> : <p className="banner">Sign in as Noor Hale to publish a tip page.</p>}
    </div>
  );
}

import { PlanForm, SubscribeButton, SubscriptionActions } from "@/components/subscription-desk";
import { zatoshiToZec } from "@/domain/money";
import { listOperations } from "@/services/overview";
import { listPlans, listSubscriptions } from "@/services/subscriptions";
import { currentActor, requireActor } from "@/server/current";
import { getStore } from "@/server/store";

export default async function SubscriptionsPage() {
  const actor = await requireActor();
  const viewer = await currentActor();
  const data = await getStore().transaction(async (tx) => {
    const plans = await listPlans(tx);
    const subs = await listSubscriptions(tx, actor);
    const versions = new Map((await listOperations(tx, actor)).map((item) => [item.id, item.version]));
    return { plans, subs, versions };
  });
  const canPublish = viewer?.user.role === "creator" || viewer?.user.role === "operator";
  return (
    <div className="stack">
      <p className="kicker">Subscriptions</p>
      <h1>Renewal coordination</h1>
      <p className="lede">ASH does not debit a shielded account on a schedule. Each renewal is an explicit payment. After grace, access is restricted and the record stays.</p>
      {canPublish ? <PlanForm /> : null}
      <div className="grid-2">
        {data.plans.map((plan) => (
          <article className="panel" key={plan.id}>
            <p className="kicker">{plan.providerName}</p>
            <h3>{plan.title}</h3>
            <p>{plan.description}</p>
            <p className="mono">
              {zatoshiToZec(BigInt(plan.priceZatoshi))} ZEC / {plan.intervalDays} days · {plan.graceDays} day grace
            </p>
            <SubscribeButton offerId={plan.id} />
          </article>
        ))}
      </div>
      <h2>Your subscriptions</h2>
      {data.subs.length === 0 ? <p className="muted">No subscriptions. Customer lists are not public.</p> : null}
      {data.subs.map((sub) => (
        <article className="panel" key={sub.id}>
          <h3>{sub.title}</h3>
          <p className="muted">{sub.customerId === "you" ? "You are the customer." : "You are the provider. The customer id is not shown here."}</p>
          {sub.customerId === "you" ? <SubscriptionActions id={sub.id} version={data.versions.get(sub.id) ?? 1} /> : null}
          <a href={`/operations/${sub.id}`}>Operation record</a>
        </article>
      ))}
    </div>
  );
}

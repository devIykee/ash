import { GuideStart } from "@/components/guide-provider";
import { ConsequenceList, PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { PlanForm, SubscribeButton, SubscriptionActions } from "@/components/subscription-desk";
import { StatusPill } from "@/components/status-pill";
import { zatoshiToZec } from "@/domain/money";
import { listOperations } from "@/services/overview";
import { listPlans, listSubscriptions } from "@/services/subscriptions";
import { config } from "@/server/config";
import { currentActor, requireActor } from "@/server/current";
import { getStore } from "@/server/store";

export const metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage() {
  const actor = await requireActor();
  const viewer = await currentActor();
  const data = await getStore().transaction(async (tx) => {
    const plans = await listPlans(tx);
    const subs = await listSubscriptions(tx, actor);
    const operations = await listOperations(tx, actor);
    const versions = new Map(operations.map((item) => [item.id, item.version]));
    const states = new Map(operations.map((item) => [item.id, item.state]));
    return { plans, subs, versions, states };
  });
  const canPublish = viewer?.user.role === "creator" || viewer?.user.role === "operator";
  const practice = config().allowSimulated;
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Payments"
        title="Subscription renewals"
        lede="Each period is a payment you confirm. ASH does not debit a shielded account on a schedule. After the grace window, access pauses and the record stays."
        actions={<GuideStart id="subscription">Guide renewals</GuideStart>}
      />
      <ConsequenceList
        items={[
          { title: "What you confirm", body: "The price of one period. The next period is a separate confirmation." },
          { title: "What others see", body: "The provider sees that you subscribed. Customer lists are not public." },
          { title: "If you cancel", body: "Future renewals stop. A payment that already succeeded is not reversed." },
        ]}
      />
      {canPublish ? <PlanForm /> : null}
      <div className="grid-2" data-guide="plan-list">
        {data.plans.length === 0 ? <p className="muted">No plans are published yet. A creator can publish one above.</p> : null}
        {data.plans.map((plan) => (
          <article className="panel stack" key={plan.id}>
            <p className="kicker">{plan.providerName}</p>
            <h3>{plan.title}</h3>
            <p>{plan.description}</p>
            <p>
              {zatoshiToZec(BigInt(plan.priceZatoshi))} ZEC every {plan.intervalDays} days, with {plan.graceDays} days of grace.
            </p>
            <SubscribeButton offerId={plan.id} title={plan.title} price={zatoshiToZec(BigInt(plan.priceZatoshi))} practice={practice} />
          </article>
        ))}
      </div>
      <h2>Your subscriptions</h2>
      <div data-guide="sub-list" className="stack">
        {data.subs.length === 0 ? (
          <EmptyState title="You have no subscription" body="Start one from a plan above. Customer lists stay private, so an empty list does not show other people." />
        ) : (
          data.subs.map((sub) => (
            <article className="panel stack" key={sub.id}>
              <h3>{sub.title}</h3>
              <StatusPill value={data.states.get(sub.id) ?? "draft"} />
              <p className="muted">{sub.customerId === "you" ? "You are the customer." : "You publish this plan. The customer’s name is not shown here."}</p>
              {sub.customerId === "you" ? <SubscriptionActions id={sub.id} version={data.versions.get(sub.id) ?? 1} practice={practice} /> : null}
              <a href={`/operations/${sub.id}`}>Open the activity record</a>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

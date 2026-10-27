import { GrantForm, WithdrawGrant } from "@/components/grant-desk";
import { GuideStart } from "@/components/guide-provider";
import { capabilityLabel, stateLabel } from "@/components/labels";
import { EmptyState } from "@/components/empty-state";
import { ConsequenceList, PageHeader } from "@/components/page-header";
import { getGrant, listGrants } from "@/services/grants";
import { requireActor } from "@/server/current";
import { getStore } from "@/server/store";

export const metadata = { title: "Audit access" };

export default async function GrantsPage() {
  const actor = await requireActor();
  const grants = await getStore().transaction(async (tx) => {
    const items = await listGrants(tx, actor);
    return Promise.all(items.map(async (item) => ({ item, detail: await getGrant(tx, actor, item.id) })));
  });
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Privacy"
        title="Limited audit access"
        lede="Give Sam a written summary, or record the limit of a viewing-key disclosure. ASH does not store a viewing key, and it cannot narrow a real key to one date or one address."
        actions={<GuideStart id="audit">Guide this access</GuideStart>}
      />
      <ConsequenceList
        items={[
          { title: "Written summary", body: "ASH can stop serving the text. A copy already saved is outside ASH." },
          { title: "Key disclosure", body: "The record describes the risk. Withdrawing it does not delete a key someone holds." },
          { title: "Who receives it", body: "In this preview, the reviewer is Sam Ibarra." },
        ]}
      />
      {actor.user.role === "auditor" ? <p className="banner">You can read access addressed to you. You cannot create it.</p> : <GrantForm />}
      <div data-guide="grant-list" className="stack">
        {grants.length === 0 ? (
          <EmptyState title="No audit access yet" body="Create a record when a reviewer needs a specific summary. Until then, nobody has been given one." />
        ) : (
          grants.map(({ item, detail }) => (
            <article className="panel stack" key={item.id}>
              <h3>{capabilityLabel(item.capability)}</h3>
              <p>{item.scopeNote}</p>
              <p className="banner">{detail.grant.disclosure}</p>
              <p>
                Access in ASH: {stateLabel(detail.grant.applicationState)}. ASH cannot cryptographically revoke a copied key. A key disclosure remains usable outside ASH:{" "}
                {detail.grant.stillUsableCryptographically ? "yes" : "no, this one is only the written summary"}.
              </p>
              {detail.grant.reportText ? <pre>{detail.grant.reportText}</pre> : null}
              {actor.user.role !== "auditor" && detail.operation.state !== "cancelled" ? (
                <WithdrawGrant id={item.id} version={detail.version} viewing={item.capability !== "filtered_report"} />
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}

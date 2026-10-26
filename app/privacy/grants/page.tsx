import { GrantForm, WithdrawGrant } from "@/components/grant-desk";
import { getGrant, listGrants } from "@/services/grants";
import { requireActor } from "@/server/current";
import { getStore } from "@/server/store";

export default async function GrantsPage() {
  const actor = await requireActor();
  const grants = await getStore().transaction(async (tx) => {
    const items = await listGrants(tx, actor);
    return Promise.all(items.map(async (item) => ({ item, detail: await getGrant(tx, actor, item.id) })));
  });
  return (
    <div className="stack">
      <p className="kicker">Audit grants</p>
      <h1>Selective disclosure records</h1>
      <p className="lede">A unified viewing key cannot be limited to one diversifier or date. ASH records the scope you claim and, for a filtered report, the text you supply.</p>
      {actor.user.role === "auditor" ? <p className="banner">You can read grants addressed to you. You cannot create one.</p> : <GrantForm />}
      {grants.map(({ item, detail }) => (
        <article className="panel" key={item.id}>
          <h3>{item.capability}</h3>
          <p>{item.scopeNote}</p>
          <p className="banner">{detail.grant.disclosure}</p>
          <p className="mono">
            Application {detail.grant.applicationState} · cryptographic revocation {String(detail.grant.cryptographicRevocation)} · key still usable{" "}
            {String(detail.grant.stillUsableCryptographically)}
          </p>
          {detail.grant.reportText ? <pre>{detail.grant.reportText}</pre> : null}
          {actor.user.role !== "auditor" && detail.operation.state !== "cancelled" ? <WithdrawGrant id={item.id} version={detail.version} /> : null}
        </article>
      ))}
    </div>
  );
}

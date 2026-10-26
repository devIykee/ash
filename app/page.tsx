import Link from "next/link";
import { overview } from "@/services/overview";
import { currentActor } from "@/server/current";
import { getStore } from "@/server/store";
import { typeLabel } from "@/components/labels";

export default async function OverviewPage() {
  const actor = await currentActor();
  if (!actor) {
    return (
      <div className="stack">
        <p className="kicker">Workspace</p>
        <h1>Private operations for people and agents.</h1>
        <p className="lede">
          ASH runs shielded payment workflows, encrypted delivery, and limited evidence on one operation model. Sign in as a demo persona to use the workspace. The default payment adapter is simulated and says so.
        </p>
        <div className="grid-2">
          <Link className="card" href="/commerce">
            <h3>Commerce</h3>
            <p className="muted">Encrypted offers, conditional delivery, and the paid research API.</p>
          </Link>
          <Link className="card" href="/payments">
            <h3>Payments</h3>
            <p className="muted">Payroll runs, tip pages, and subscription renewals.</p>
          </Link>
          <Link className="card" href="/privacy">
            <h3>Privacy tools</h3>
            <p className="muted">Memo linter and viewing-key grant records.</p>
          </Link>
          <Link className="card" href="/docs">
            <h3>Documentation</h3>
            <p className="muted">What is implemented, what is simulated, and what ASH does not prove.</p>
          </Link>
        </div>
      </div>
    );
  }
  const data = await getStore().transaction((tx) => overview(tx, actor));
  return (
    <div className="stack">
      <p className="kicker">Overview</p>
      <h1>Needs attention</h1>
      <p className="lede">Amounts stay off this page. Open an operation when you need its detail.</p>
      {data.warnings.map((warning) => (
        <p className="banner" key={warning}>
          {warning}
        </p>
      ))}
      <section className="stack">
        <h2>Active</h2>
        {data.cards.length === 0 ? <p className="muted">No operations yet.</p> : null}
        <div className="grid-2">
          {data.cards.map((card) => (
            <Link className="card" key={card.id} href={`/operations/${card.id}`}>
              <p className="kicker">{typeLabel(card.type)}</p>
              <h3>{card.label}</h3>
              <span className="pill" data-state={card.state}>
                {card.state.replaceAll("_", " ")}
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="grid-2">
        <div className="panel">
          <h2>Pending verification</h2>
          <p className="mono">{data.pendingVerification.length === 0 ? "None" : data.pendingVerification.join(", ")}</p>
        </div>
        <div className="panel">
          <h2>Unresolved delivery</h2>
          <p className="mono">{data.unresolvedDelivery.length === 0 ? "None" : data.unresolvedDelivery.join(", ")}</p>
        </div>
      </section>
    </div>
  );
}

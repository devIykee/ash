import { recordLabel } from "@/components/labels";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { TaskLauncher } from "@/components/task-launcher";
import { typeLabel } from "@/components/labels";
import { overview } from "@/services/overview";
import { currentActor } from "@/server/current";
import { runtime } from "@/server/runtime";
import { getStore } from "@/server/store";

export const metadata = { title: "Workspace" };

export default async function WorkspacePage() {
  const actor = await currentActor();
  if (!actor) {
    return (
      <div className="stack">
        <PageHeader
          eyebrow="Workspace"
          title="What do you want to do?"
          lede="Pick a demo person in the account menu. No password. Avery pays people. Noor gets paid. Jules buys files. Sam reviews records."
        />
        <p className="banner">
          {runtime().practice
            ? "Practice payments stay on this site. They are not sent on the network."
            : "You pay from your own wallet. ASH only looks up the transaction id you enter."}
        </p>
        <TaskLauncher />
      </div>
    );
  }
  const data = await getStore().read((tx) => overview(tx, actor));
  const attention = data.attention;
  const labelFor = (id: string) => data.cards.find((card) => card.id === id)?.label ?? "Open record";
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Workspace"
        title={attention.length > 0 ? "Something needs you" : "Here is where things stand"}
        lede="Open a record when you need its amount and detail. This page does not invent balances."
      />
      {data.problems.map((problem) => (
        <p className="banner danger" key={problem}>
          {problem}
        </p>
      ))}
      <details className="notes">
        <summary>About this deployment</summary>
        <ul>
          {data.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </details>
      <section className="stack">
        <h2>Needs attention</h2>
        {attention.length === 0 ? (
          <EmptyState title="Nothing is waiting" body="Failed payments, unfinished deliveries, and renewals in grace show up here. You can start a task below when you are ready." />
        ) : (
          <div className="stack">
            {attention.map((card) => (
              <Link className="card" key={card.id} href={`/operations/${card.id}`}>
                <p className="kicker">{typeLabel(card.type)}</p>
                <h3>{recordLabel(card.label)}</h3>
                <StatusPill value={card.state} />
              </Link>
            ))}
          </div>
        )}
      </section>
      <section className="grid-2">
        <div className="panel stack">
          <h2>Still being checked</h2>
          {data.pendingVerification.length === 0 ? (
            <p className="muted">No payment is waiting for a check.</p>
          ) : (
            data.pendingVerification.map((id) => (
              <Link key={id} href={`/operations/${id}`}>
                {labelFor(id)}
              </Link>
            ))
          )}
        </div>
        <div className="panel stack">
          <h2>Delivery not finished</h2>
          {data.unresolvedDelivery.length === 0 ? (
            <p className="muted">No file is waiting on a sender or a failed delivery.</p>
          ) : (
            data.unresolvedDelivery.map((id) => (
              <Link key={id} href={`/commerce/exchanges/${id}`}>
                {labelFor(id)}
              </Link>
            ))
          )}
        </div>
      </section>
      <section className="stack">
        <h2>Recent activity</h2>
        {data.cards.length === 0 ? (
          <EmptyState title="No activity yet" body="When you pay someone, publish a tip page, or exchange a file, the record appears here." />
        ) : (
          <div className="stack">
            {data.cards.map((card) => (
              <Link className="card" key={card.id} href={`/operations/${card.id}`}>
                <p className="kicker">{typeLabel(card.type)}</p>
                <h3>{recordLabel(card.label)}</h3>
                <StatusPill value={card.state} />
              </Link>
            ))}
          </div>
        )}
      </section>
      <TaskLauncher />
    </div>
  );
}

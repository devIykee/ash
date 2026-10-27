import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { TaskLauncher } from "@/components/task-launcher";
import { typeLabel } from "@/components/labels";
import { overview } from "@/services/overview";
import { currentActor } from "@/server/current";
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
          lede="Choose a demo person from the account menu. Avery pays people, Noor receives payments, Jules buys files, and Sam reviews records. No password is stored."
        />
        <p className="banner">Nothing is in progress until you enter. Practice payments are labeled, and this preview does not broadcast a Zcash transaction.</p>
        <TaskLauncher />
      </div>
    );
  }
  const data = await getStore().transaction((tx) => overview(tx, actor));
  const attention = data.attention;
  const labelFor = (id: string) => data.cards.find((card) => card.id === id)?.label ?? "Open record";
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Workspace"
        title={attention.length > 0 ? "Something needs you" : "Here is where things stand"}
        lede="Open a record when you need its amount and detail. This page does not invent balances."
      />
      {data.warnings.map((warning) => (
        <p className="banner" key={warning}>
          {warning}
        </p>
      ))}
      <section className="stack">
        <h2>Needs attention</h2>
        {attention.length === 0 ? (
          <EmptyState title="Nothing is waiting" body="Failed payments, unfinished deliveries, and renewals in grace show up here. You can start a task below when you are ready." />
        ) : (
          <div className="stack">
            {attention.map((card) => (
              <Link className="card" key={card.id} href={`/operations/${card.id}`}>
                <p className="kicker">{typeLabel(card.type)}</p>
                <h3>{card.label}</h3>
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
                <h3>{card.label}</h3>
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

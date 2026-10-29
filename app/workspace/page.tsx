import { pageRead } from "@/server/page-data";
import { CircleAlert, CircleCheck, Hourglass, Layers } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { initials, relativeTime } from "@/components/format";
import { moduleHref, recordLabel, roleLabel, typeLabel } from "@/components/labels";
import { PageHeader } from "@/components/page-header";
import { RecordList } from "@/components/record-list";
import { TaskLauncher } from "@/components/task-launcher";
import { overview } from "@/services/overview";
import { currentActor } from "@/server/current";
import { pageRuntime } from "@/server/runtime";

export const metadata = { title: "Workspace" };

// Opens the task where the person can act. Tip payments are child records, so they open their record.
function actionHref(card: { id: string; type: string }): string {
  return card.type === "tip" ? `/operations/${card.id}` : moduleHref(card.type, card.id);
}

export default async function WorkspacePage() {
  const actor = await currentActor();
  if (!actor) {
    return (
      <div className="stack">
        <PageHeader
          eyebrow="Workspace"
          title="What do you want to do?"
          lede="Pick a demo person from the account menu. There is no password. Avery pays people, Noor gets paid, Jules buys files, and Sam reviews records."
        />
        <p className="banner info">
          {(await pageRuntime()).practice
            ? "Practice payments stay on this site. They are not sent on the network."
            : "You pay from your own wallet. ASH only looks up the transaction id you enter."}
        </p>
        <TaskLauncher />
      </div>
    );
  }
  const data = await pageRead((tx) => overview(tx, actor));
  const firstName = actor.user.name.split(" ")[0];
  return (
    <div className="stack" style={{ gap: "1.6rem" }}>
      <header className="page-head">
        <div className="greeting">
          <span className="avatar lg" aria-hidden="true">
            {initials(actor.user.name)}
          </span>
          <div>
            <h1>
              Welcome back, {firstName}
            </h1>
            <p className="muted">
              {roleLabel(actor.user.role)}. {data.counts.attention > 0 ? `${data.counts.attention} ${data.counts.attention === 1 ? "record needs" : "records need"} you.` : "Nothing needs you right now."}
            </p>
          </div>
        </div>
      </header>

      {data.problems.map((problem) => (
        <p className="banner danger" key={problem}>
          {problem}
        </p>
      ))}

      <section className="stats" aria-label="Summary">
        <Link className="stat" href="/operations" data-tone="attention">
          <span className="stat-label">
            <CircleAlert size={16} aria-hidden="true" /> Needs attention
          </span>
          <span className="stat-value">{data.counts.attention}</span>
        </Link>
        <Link className="stat" href="/operations" data-tone="info">
          <span className="stat-label">
            <Hourglass size={16} aria-hidden="true" /> Being checked
          </span>
          <span className="stat-value">{data.counts.checking}</span>
        </Link>
        <Link className="stat" href="/operations" data-tone="ok">
          <span className="stat-label">
            <CircleCheck size={16} aria-hidden="true" /> Completed
          </span>
          <span className="stat-value">{data.counts.completed}</span>
        </Link>
        <Link className="stat" href="/operations">
          <span className="stat-label">
            <Layers size={16} aria-hidden="true" /> All records
          </span>
          <span className="stat-value">{data.counts.total}</span>
        </Link>
      </section>

      {data.attention.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>Needs attention</h2>
          </div>
          <RecordList
            label="Needs attention"
            rows={data.attention.map((card) => ({
              href: actionHref(card),
              title: recordLabel(card.label),
              type: card.type,
              sub: `${typeLabel(card.type)} · ${relativeTime(card.updatedAt)}`,
              state: card.state,
            }))}
          />
        </section>
      ) : null}

      <TaskLauncher compact={data.counts.total > 0} />

      <section className="section">
        <div className="section-head">
          <h2>Recent activity</h2>
          {data.cards.length > 0 ? <Link href="/operations">View all</Link> : null}
        </div>
        {data.cards.length === 0 ? (
          <EmptyState title="No activity yet" body="When you pay someone, publish a tip page, or exchange a file, the record appears here." />
        ) : (
          <RecordList
            label="Recent activity"
            rows={data.cards.slice(0, 8).map((card) => ({
              href: `/operations/${card.id}`,
              title: recordLabel(card.label),
              type: card.type,
              sub: `${typeLabel(card.type)} · ${relativeTime(card.updatedAt)}`,
              state: card.state,
            }))}
          />
        )}
      </section>

      <details className="notes">
        <summary>About this deployment</summary>
        <ul>
          {data.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

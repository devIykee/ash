import Link from "next/link";
import { typeLabel } from "@/components/labels";
import { listOperations } from "@/services/overview";
import { requireActor } from "@/server/current";
import { getStore } from "@/server/store";

export default async function OperationsPage() {
  const actor = await requireActor();
  const items = await getStore().transaction((tx) => listOperations(tx, actor));
  return (
    <div className="stack">
      <p className="kicker">Operations</p>
      <div className="row">
        <h1>History</h1>
        <Link className="button quiet" href="/operations/verify">
          Verify evidence
        </Link>
      </div>
      {items.length === 0 ? <p className="muted">Operations you participate in appear here.</p> : null}
      {items.map((item) => (
        <Link className="card" key={item.id} href={`/operations/${item.id}`}>
          <p className="kicker">{typeLabel(item.type)}</p>
          <h3>{item.label}</h3>
          <span className="pill" data-state={item.state}>
            {item.state.replaceAll("_", " ")}
          </span>
        </Link>
      ))}
    </div>
  );
}

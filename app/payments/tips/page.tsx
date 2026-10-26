import Link from "next/link";
import { listTips } from "@/services/tips";
import { currentActor } from "@/server/current";
import { getStore } from "@/server/store";

export default async function TipsPage() {
  const actor = await currentActor();
  const tips = actor ? await getStore().transaction((tx) => listTips(tx, actor)) : [];
  return (
    <div className="stack">
      <p className="kicker">Tips</p>
      <div className="row">
        <h1>Tip pages</h1>
        <Link className="button" href="/payments/tips/new">
          New tip page
        </Link>
      </div>
      {tips.length === 0 ? <p className="muted">Pages you publish appear here. Anyone with the link can open one.</p> : null}
      {tips.map((tip) => (
        <Link className="card" key={tip.id} href={`/payments/tips/${tip.id}`}>
          <h3>{tip.title}</h3>
        </Link>
      ))}
    </div>
  );
}

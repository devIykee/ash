import Link from "next/link";
import { listPayroll } from "@/services/payroll";
import { requireActor } from "@/server/current";
import { getStore } from "@/server/store";

export default async function PayrollListPage() {
  const actor = await requireActor();
  const runs = await getStore().transaction((tx) => listPayroll(tx, actor));
  return (
    <div className="stack">
      <p className="kicker">Payroll</p>
      <div className="row">
        <h1>Contractor runs</h1>
        {actor.user.role === "operator" ? (
          <Link className="button" href="/payments/payroll/new">
            New run
          </Link>
        ) : null}
      </div>
      {actor.user.role === "auditor" ? <p className="banner">You see aggregate status. Recipient lines stay on the operator view.</p> : null}
      {runs.length === 0 ? <p className="muted">No runs yet.</p> : null}
      {runs.map((run) => (
        <Link className="card" key={run.id} href={`/payments/payroll/${run.id}`}>
          <h3>{run.label}</h3>
          <span className="pill" data-state={run.state}>
            {run.state.replaceAll("_", " ")}
          </span>
        </Link>
      ))}
    </div>
  );
}

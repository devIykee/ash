import { PayrollForm } from "@/components/payroll-form";
import { requireActor } from "@/server/current";

export default async function NewPayrollPage() {
  const actor = await requireActor();
  return (
    <div className="stack">
      <p className="kicker">Payroll</p>
      <h1>New run</h1>
      {actor.user.role === "operator" ? <PayrollForm /> : <p className="banner">Only Avery Chen can create a run.</p>}
    </div>
  );
}

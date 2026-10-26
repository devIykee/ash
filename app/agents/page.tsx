import Link from "next/link";
import { AgentForm, PaidApiDemo, RevokeAgent } from "@/components/agent-desk";
import { zatoshiToZec } from "@/domain/money";
import { listAgentTokens } from "@/services/agents";
import { requireActor } from "@/server/current";
import { getStore } from "@/server/store";

export default async function AgentsPage() {
  const actor = await requireActor();
  const tokens = actor.user.role === "operator" ? await getStore().transaction((tx) => listAgentTokens(tx, actor)) : [];
  return (
    <div className="stack">
      <p className="kicker">Agents</p>
      <h1>Agent access</h1>
      <p className="lede">
        Tokens are bearer secrets with a zatoshi budget and scopes. The deterministic demo agent is <span className="mono">pnpm agent:demo</span> against a running server. It does not use a model to approve payment.
      </p>
      <section className="panel stack">
        <h2>Paid research note</h2>
        <p>GET /api/v1/paid/research returns HTTP 402 until a payment reference for that exact challenge is verified. The reference works once.</p>
        <PaidApiDemo />
      </section>
      {actor.user.role === "operator" ? <AgentForm /> : <p className="banner">Sign in as Avery Chen to mint an agent token.</p>}
      {tokens.map((token) => (
        <article className="panel" key={token.id}>
          <h3>{token.name}</h3>
          <p className="mono">
            {token.prefix}… · {zatoshiToZec(BigInt(token.spentZatoshi))} / {zatoshiToZec(BigInt(token.budgetZatoshi))} ZEC · {token.scopes.join(", ")}
          </p>
          <p>{token.revokedAt ? `Revoked ${token.revokedAt}` : "Active"}</p>
          {token.revokedAt ? null : <RevokeAgent id={token.id} />}
        </article>
      ))}
      <Link href="/docs/AGENT_API">Agent API reference</Link>
    </div>
  );
}

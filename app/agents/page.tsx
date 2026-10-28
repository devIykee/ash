import Link from "next/link";
import { AgentForm, PaidApiDemo, RevokeAgent } from "@/components/agent-desk";
import { GuideStart } from "@/components/guide-provider";
import { ConsequenceList, PageHeader } from "@/components/page-header";
import { zatoshiToZec } from "@/domain/money";
import { listAgentTokens } from "@/services/agents";
import { config } from "@/server/config";
import { requireActor } from "@/server/current";
import { getStore } from "@/server/store";

export const metadata = { title: "Agents" };

export default async function AgentsPage() {
  const actor = await requireActor();
  const tokens = actor.user.role === "operator" ? await getStore().read((tx) => listAgentTokens(tx, actor)) : [];
  const practice = config().allowSimulated;
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Agents"
        title="Let software pay within a limit"
        lede="A token is a secret with a spending limit. The included demo follows the paid-request steps. It is not a model that decides to pay."
        actions={<GuideStart id="agent">Guide an agent token</GuideStart>}
      />
      <ConsequenceList
        items={[
          { title: "The secret", body: "Shown once. ASH keeps only a hash." },
          { title: "The limit", body: "The token cannot spend past its budget, and it cannot approve a contractor run." },
          { title: "Revoking it", body: "Stops future calls. It does not undo a payment already made." },
        ]}
      />
      <section className="panel stack">
        <h2>Paid research note</h2>
        <p>Asking for the note returns a payment request first. The note comes back only after that exact request is paid. The reference works once.</p>
        <PaidApiDemo practice={practice} />
      </section>
      {actor.user.role === "operator" ? <AgentForm /> : <p className="banner">Sign in as Avery Chen to create an agent token.</p>}
      <div data-guide="agent-list" className="stack">
        {tokens.length === 0 && actor.user.role === "operator" ? <p className="muted">No tokens yet. Create one when a program needs to call ASH.</p> : null}
        {tokens.map((token) => (
          <article className="panel stack" key={token.id}>
            <h3>{token.name}</h3>
            <p>
              {token.prefix}… · {zatoshiToZec(BigInt(token.spentZatoshi))} of {zatoshiToZec(BigInt(token.budgetZatoshi))} ZEC used · {token.scopes.join(", ")}
            </p>
            <p>{token.revokedAt ? `Revoked ${token.revokedAt}` : "Active"}</p>
            {token.revokedAt ? null : <RevokeAgent id={token.id} />}
          </article>
        ))}
      </div>
      <Link href="/docs/AGENT_API">Agent API reference</Link>
    </div>
  );
}

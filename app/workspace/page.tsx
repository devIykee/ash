import { ArrowRight, FileLock2, HandCoins, KeyRound, Send, Sparkles, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { relativeTime } from "@/components/format";
import { moduleHref, recordLabel, stateLabel, typeLabel } from "@/components/labels";
import { PersonaPicker } from "@/components/persona-picker";
import { RecordList } from "@/components/record-list";
import { MODE_HINTS, MODE_LABELS } from "@/components/runtime";
import { overview } from "@/services/overview";
import { payoutAddress } from "@/services/wallet-keys";
import { currentActor } from "@/server/current";
import { pageRead } from "@/server/page-data";
import { pageRuntime } from "@/server/runtime";

export const metadata = { title: "Workspace" };

const PAGE_NAMES: Record<string, string> = {
  "/agents": "Agents",
  "/settings": "Receiving keys",
  "/operations": "Activity",
  "/payments/payroll": "Payroll",
  "/payments/subscriptions": "Subscriptions",
  "/payments/tips": "Tip pages",
  "/privacy/grants": "Audit access",
  "/privacy/memo": "Memo check",
  "/commerce": "Exchange",
};

function pageName(next: string | null): string | null {
  if (!next) return null;
  const path = next.split("?")[0];
  const match = Object.keys(PAGE_NAMES)
    .sort((a, b) => b.length - a.length)
    .find((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  return match ? PAGE_NAMES[match] : "that page";
}

type Intent = { title: string; icon: LucideIcon; tone?: "warm" | "info"; actions: [string, string][] };

const INTENTS: Intent[] = [
  {
    title: "Get paid",
    icon: HandCoins,
    tone: "warm",
    actions: [
      ["/payments/tips/new?guide=tips", "Publish a tip page"],
      ["/payments/subscriptions?guide=subscription", "Offer a subscription"],
      ["/agents?guide=api", "Sell an API call"],
    ],
  },
  {
    title: "Pay someone",
    icon: Send,
    actions: [
      ["/payments/payroll/new?guide=payroll", "Pay a team in one run"],
      ["/payments/subscriptions", "Renew a subscription"],
      ["/agents?guide=agent", "Let an agent pay, with a limit"],
    ],
  },
  {
    title: "Trade privately",
    icon: FileLock2,
    tone: "info",
    actions: [
      ["/commerce?guide=exchange", "Buy or sell a locked file"],
      ["/privacy/grants?guide=audit", "Share one summary with a reviewer"],
      ["/privacy/memo?guide=memo", "Check a memo before sending"],
    ],
  },
];

type NextStep = { kicker: string; title: string; body: string; href: string; cta: string; icon: LucideIcon };

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: rawNext } = await searchParams;
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;
  const actor = await currentActor();
  const env = await pageRuntime();

  if (!actor) {
    const name = pageName(next);
    return (
      <div className="flow">
        <header className="flow-head">
          <p className="kicker">{name ? `Choose a person to open ${name}` : "Welcome to ASH"}</p>
          <h1>Who are you today?</h1>
          <p className="lede">Pick a demo person to start. Each one sees only their own payments, files, and records.</p>
        </header>
        <PersonaPicker next={next} />
      </div>
    );
  }

  const data = await pageRead(async (tx) => ({
    summary: await overview(tx, actor),
    payout: env.practice ? null : await payoutAddress(tx, actor.user.id, env.network),
  }));
  const firstName = actor.user.name.split(" ")[0];
  const role = actor.user.role;
  const takesPayments = role === "creator" || role === "operator";
  const top = data.summary.attention[0];

  // One recommended step: setup first, then unfinished work, then the person's main job.
  const step: NextStep =
    !env.practice && takesPayments && !data.payout
      ? {
          kicker: `Set up ${MODE_LABELS[env.mode]}`,
          title: "Get a wallet ready to be paid",
          body: "Create one in your browser in a minute, or connect one you have. ASH only ever sees the address and a viewing key.",
          href: "/settings",
          cta: "Set up my wallet",
          icon: KeyRound,
        }
      : top
        ? {
            kicker: "Needs you",
            title: recordLabel(top.label),
            body: `${typeLabel(top.type)} · ${stateLabel(top.state)} · ${relativeTime(top.updatedAt)}`,
            href: top.type === "tip" ? `/operations/${top.id}` : moduleHref(top.type, top.id),
            cta: "Continue",
            icon: ArrowRight,
          }
        : role === "operator"
          ? { kicker: "Suggested", title: "Pay your team in one run", body: "Add people and amounts, approve once, then pay every line together.", href: "/payments/payroll/new?guide=payroll", cta: "Start a payment run", icon: Send }
          : role === "creator"
            ? { kicker: "Suggested", title: "Get paid with a tip page", body: "Publish a page with a payment link. Supporters get a signed receipt.", href: "/payments/tips/new?guide=tips", cta: "Publish a tip page", icon: HandCoins }
            : role === "buyer"
              ? { kicker: "Suggested", title: "Buy a locked file", body: "Pay the seller, and the file opens only on your device.", href: "/commerce?guide=exchange", cta: "Browse files", icon: FileLock2 }
              : { kicker: "Suggested", title: "Review what was shared with you", body: "Open the summaries and payroll totals people chose to show you.", href: "/privacy/grants", cta: "Open shared records", icon: FileLock2 };

  const StepIcon = next ? ArrowRight : step.icon;
  return (
    <div className="flow">
      <header className="flow-head">
        <p className="kicker">
          {MODE_LABELS[env.mode]} · {MODE_HINTS[env.mode]}
        </p>
        <h1>Hi {firstName}, what&apos;s next?</h1>
      </header>

      {data.summary.problems.map((problem) => (
        <p className="banner danger" key={problem}>
          {problem}
        </p>
      ))}

      <Link className="next-step" href={next ?? step.href}>
        <span className="next-icon" aria-hidden="true">
          <StepIcon size={22} />
        </span>
        <span className="next-text">
          <span className="kicker">{next ? "Continue where you were going" : step.kicker}</span>
          <strong>{next ? pageName(next) : step.title}</strong>
          {next ? null : <span className="muted">{step.body}</span>}
        </span>
        <span className="next-cta">
          {next ? "Open" : step.cta} <ArrowRight size={16} aria-hidden="true" />
        </span>
      </Link>

      <section className="section" data-guide="task-launcher">
        <h2 className="flow-h2">
          <Sparkles size={18} aria-hidden="true" /> Or choose what you want to do
        </h2>
        <div className="intents">
          {INTENTS.map((intent) => {
            const Icon = intent.icon;
            return (
              <div className="intent" key={intent.title} data-tone={intent.tone}>
                <span className="tile-icon" aria-hidden="true">
                  <Icon size={19} />
                </span>
                <strong>{intent.title}</strong>
                <ul>
                  {intent.actions.map(([href, label]) => (
                    <li key={href}>
                      <Link href={href}>
                        {label} <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {data.summary.cards.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2 className="flow-h2">Recent</h2>
            <Link href="/operations">All activity</Link>
          </div>
          <RecordList
            label="Recent activity"
            rows={data.summary.cards.slice(0, 4).map((card) => ({
              href: `/operations/${card.id}`,
              title: recordLabel(card.label),
              type: card.type,
              sub: `${typeLabel(card.type)} · ${relativeTime(card.updatedAt)}`,
              state: card.state,
            }))}
          />
        </section>
      ) : null}
    </div>
  );
}

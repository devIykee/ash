import { Bot, FileLock2, FileSearch, Gavel, HandCoins, RefreshCcw, ScanEye, Users, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";

type Task = { href: string; title: string; body: string; icon: LucideIcon; tone?: "warm" | "info" };

const COMMON: Task[] = [
  { href: "/payments/payroll/new?guide=payroll", title: "Pay a group of people", body: "Check a batch, approve it, then record each payment.", icon: Users },
  { href: "/payments/tips/new?guide=tips", title: "Receive a private tip", body: "Publish a page and a wallet link. Keep a short receipt.", icon: HandCoins, tone: "warm" },
  { href: "/commerce?guide=exchange", title: "Buy or sell a file", body: "Encrypted in the browser, opened on the buyer’s device.", icon: FileLock2, tone: "info" },
];

const MORE: Task[] = [
  { href: "/payments/subscriptions?guide=subscription", title: "Recurring payments", body: "Each renewal is a payment you confirm.", icon: RefreshCcw },
  { href: "/agents?guide=api", title: "Pay for an API request", body: "One payment, one response.", icon: Zap, tone: "warm" },
  { href: "/privacy/grants?guide=audit", title: "Share with a reviewer", body: "A written summary, not your whole account.", icon: ScanEye, tone: "info" },
  { href: "/privacy/memo?guide=memo", title: "Check a memo", body: "Find private details before they leave.", icon: FileSearch },
  { href: "/operations?guide=evidence", title: "Prepare dispute evidence", body: "A sealed package of what ASH stored.", icon: Gavel, tone: "warm" },
  { href: "/agents?guide=agent", title: "Connect an AI agent", body: "A limited token. Shown once.", icon: Bot, tone: "info" },
];

function Tiles({ tasks }: { tasks: Task[] }) {
  return (
    <div className="tiles">
      {tasks.map((task) => {
        const Icon = task.icon;
        return (
          <Link className="tile" key={task.href} href={task.href} data-tone={task.tone}>
            <span className="tile-icon" aria-hidden="true">
              <Icon size={19} />
            </span>
            <strong>{task.title}</strong>
            <span>{task.body}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function TaskLauncher({ compact = false }: { compact?: boolean }) {
  return (
    <section className="section" data-guide="task-launcher">
      <div className="section-head">
        <h2>Start something new</h2>
        <span className="muted" style={{ fontSize: "0.9rem" }}>
          Each task opens with a short guide you can exit.
        </span>
      </div>
      <Tiles tasks={compact ? COMMON : [...COMMON, ...MORE]} />
    </section>
  );
}

import Link from "next/link";

const COMMON = [
  ["/payments/payroll/new?guide=payroll", "Pay a group of people", "Check a batch, approve it, then record each payment."],
  ["/payments/tips/new?guide=tips", "Receive a private tip", "Publish a page, share a payment link, and keep a short receipt."],
  ["/commerce?guide=exchange", "Buy or sell a digital resource", "Encrypt a file in the browser, then open it on the recipient’s device."],
] as const;

const MORE = [
  ["/agents?guide=api", "Pay for an API or online service", "Buy one research note. The same payment works once."],
  ["/payments/subscriptions?guide=subscription", "Set up recurring payments", "Each renewal is a separate payment you confirm."],
  ["/privacy/grants?guide=audit", "Review financial information privately", "Share a written summary, or record the limits of a broader disclosure."],
  ["/privacy/memo?guide=memo", "Check a transaction memo", "Look for sensitive details before the note leaves this browser."],
  ["/operations?guide=evidence", "Prepare evidence for a dispute", "Prepare a package of what ASH stored. The package does not make a claim true."],
  ["/agents?guide=agent", "Connect an AI agent", "Create a limited token. The secret is shown once."],
] as const;

export function TaskLauncher() {
  return (
    <section className="groups" data-guide="task-launcher">
      <div className="group">
        <h2>Start something new</h2>
        <p className="muted">Common tasks open the real page, with a short guide you can exit.</p>
        <div className="task-list">
          {COMMON.map(([href, title, body]) => (
            <Link className="task-link" key={href} href={href}>
              <strong>{title}</strong>
              <span className="muted">{body}</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="group">
        <h2>Other tasks</h2>
        <div className="task-list">
          {MORE.map(([href, title, body]) => (
            <Link className="task-link" key={href} href={href}>
              <strong>{title}</strong>
              <span className="muted">{body}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

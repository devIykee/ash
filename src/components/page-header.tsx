import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      {eyebrow ? <p className="kicker">{eyebrow}</p> : null}
      <div className="page-head-row">
        <h1>{title}</h1>
        {actions}
      </div>
      {lede ? <p className="lede">{lede}</p> : null}
    </header>
  );
}

export function ConsequenceList({ items }: { items: { title: string; body: string }[] }) {
  return (
    <dl className="consequences">
      {items.map((item) => (
        <div key={item.title}>
          <dt>{item.title}</dt>
          <dd>{item.body}</dd>
        </div>
      ))}
    </dl>
  );
}
